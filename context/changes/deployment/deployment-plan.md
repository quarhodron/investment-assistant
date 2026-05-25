# Cloudflare Workers — First Deploy Plan (Astro 6 SSR)

## Context

This plan executes the **first production deploy** of the investment-assistant MVP per the platform decision recorded in `context/foundation/infrastructure.md` (Cloudflare Workers + `@astrojs/cloudflare` adapter, SSR mode, Supabase as managed dependency).

State as of 2026-05-25:

- Repo configuration is **already Workers-shaped**: `wrangler.jsonc` declares `main: "@astrojs/cloudflare/entrypoints/server"`, the `ASSETS` binding, `nodejs_compat`, observability, and `compatibility_date: 2026-05-08`. `astro.config.mjs` uses `output: "server"` with the `cloudflare()` adapter and declares `SUPABASE_URL` / `SUPABASE_KEY` as `astro:env/server` secrets.
- **Wrangler is already authenticated via `wrangler login` (OAuth).** `wrangler whoami` returns the user, and the broad OAuth privileges are explicitly accepted for this solo MVP. No scoped API token will be minted.
- **Manual local deploys only.** No GitHub Actions deploy job. CI keeps its current lint+build role; production pushes happen from the dev's machine via `npm run deploy`.
- **Worker / project name correction**: scaffold default is `10x-astro-starter` (in `wrangler.jsonc` and `package.json`). Both must be renamed to `investment-assistant` before the first deploy so the live URL reflects the actual product name.
- `tech-stack.md` frontmatter currently says `cloudflare-pages` — must be corrected to `cloudflare-workers` to close the contract-drift risk in `infrastructure.md`.
- A `wrangler.jsonc` secrets-leak pre-commit guard will be added (high-impact / low-likelihood risk).
- No Supabase migrations directory exists; schema is managed externally. The plan does not apply migrations.

This plan does **not** modify application code. The Supabase SSR client (`src/lib/supabase.ts`) and config-status helper (`src/lib/config-status.ts`) already null-guard missing env, so a deploy with secrets unset would boot but show degraded auth — useful in the Phase 3 smoke step.

## Critical files

**Will be modified:**

- `context/foundation/tech-stack.md` — frontmatter `deployment_target` correction
- `wrangler.jsonc` — `name` field rename (`10x-astro-starter` → `investment-assistant`)
- `package.json` — `name` field rename + add `deploy` script
- `.husky/pre-commit` — extend with secrets-leak guard and stale-Pages-command grep
- `scripts/check-wrangler-secrets.mjs` _(new)_ — pre-commit guard implementation
- `context/deployment/runbook.md` _(new)_ — operational runbook

**Verify, do not modify:**

- `astro.config.mjs` — already correct
- `src/lib/supabase.ts`, `src/lib/config-status.ts` — already null-guard missing env safely
- `.github/workflows/ci.yml` — keeps current lint+build role; **no deploy job is added**

> **Note on `wrangler deploy --yes`:** The infrastructure.md uses `--yes` in its example. Wrangler v4 is non-interactive by default when no TTY is attached, so `--yes` is **only needed** if a confirmation prompt actually appears. We omit it from the canonical commands below; add it if you see a prompt.

> **Note on auth posture:** Using `wrangler login` (OAuth) gives wrangler broad account privileges tied to the dev's Cloudflare login. This is **acceptable for solo, local-only deploy** but has tradeoffs: token lives in `~/.wrangler/config/default.toml`, scoped to the user not the project, and any future CI / second-dev / shared-machine scenario should revisit by minting a scoped API token (`Workers Scripts:Edit` + `Account Settings:Read` only). The runbook captures this as a future-revisit item.

---

## Phase 1 — Pre-flight (read-only sanity + name corrections)

**Goal:** Rename the worker / package to `investment-assistant`, patch the tech-stack contract, and confirm the local build is green before touching production.

- [ ] **Rename worker in `wrangler.jsonc`**: change `"name": "10x-astro-starter"` → `"name": "investment-assistant"`. Save.
- [ ] **Rename package in `package.json`**: change `"name": "10x-astro-starter"` → `"name": "investment-assistant"`. Save. (No npm publish involved; this is purely cosmetic for tooling that surfaces the name.)
- [ ] **Patch `tech-stack.md`**: change frontmatter line `deployment_target: cloudflare-pages` → `deployment_target: cloudflare-workers`. Save.
- [ ] Confirm `wrangler.jsonc` (post-rename) has: `main: "@astrojs/cloudflare/entrypoints/server"`, `assets.binding: "ASSETS"`, `assets.directory: "./dist"`, `assets.not_found_handling: "404-page"`, `compatibility_flags: ["nodejs_compat"]`, `observability.enabled: true`. **Do not edit** anything else.
- [ ] Confirm `astro.config.mjs` declares `output: "server"`, `adapter: cloudflare()`, and the two `envField.string({ context: "server", access: "secret", optional: true })` entries. **Do not edit**.
- [ ] Confirm `.dev.vars`, `.wrangler/`, `.env`, `.env.production` are gitignored: `grep -E '^\.dev\.vars$|^\.wrangler/$|^\.env' .gitignore`.
- [ ] Confirm Node version: `cat .nvmrc` → `22.14.0`. Run `nvm use` (or verify `node -v` is 22.x).
- [ ] Run `npm ci` to ensure clean dependency tree.
- [ ] Run `npx astro sync` — generates `astro:env` types from `astro.config.mjs`.
- [ ] Run `npm run lint` — must exit 0.
- [ ] Run `npm run build` — must exit 0 and produce `dist/` with `dist/_worker.js/` and `dist/_astro/` static assets.
- [ ] `grep -RIn "wrangler pages" package.json .github/workflows/ || echo "OK: no stale Pages commands"` — must print "OK".

**Verification:**

- `npm run build` succeeds locally.
- `dist/_worker.js/index.js` exists.
- `git diff --stat` shows exactly three modified files: `wrangler.jsonc`, `package.json`, `context/foundation/tech-stack.md`.

**Rollback:** This phase mutates only three tracked files and the local `dist/`. Revert with `git checkout -- wrangler.jsonc package.json context/foundation/tech-stack.md` and `rm -rf dist .astro`.

---

## Phase 2 — Wrangler auth sanity

**Goal:** Confirm the existing `wrangler login` session is alive and points at the right account before pushing the first deploy. **No token minting** — the user has explicitly accepted the OAuth posture.

- [ ] Run `npx wrangler whoami`. Confirm:
  - The email matches the intended Cloudflare account.
  - The account ID is shown (capture it for the runbook).
  - The session is not expired (no `OAuth token expired` message). If expired, re-run `npx wrangler login`.
- [ ] Confirm there is **no pre-existing Worker named `investment-assistant`** in this account that you didn't put there:
  ```sh
  npx wrangler deployments list --name investment-assistant 2>&1 | head -20
  ```
  Expect either an empty list / "no deployments" / "Worker not found" response. If a Worker by that name already exists with deploys you don't recognize, **stop and investigate** before Phase 3 — Phase 3 will overwrite it.

**Verification:**

- `wrangler whoami` returns the expected email + account ID.
- No surprise pre-existing `investment-assistant` Worker in the account.

**Rollback / if it fails:** `wrangler logout && wrangler login` re-issues the OAuth flow. No production state has been touched yet.

---

## Phase 3 — Local first deploy + production secrets

**Goal:** Push the first Worker, set Supabase secrets via `wrangler secret put`, smoke-test the live URL, and add the `npm run deploy` script.

- [ ] Set production `SUPABASE_URL` (replace `<value>` with the real Supabase project URL):

  ```sh
  printf '%s' '<value>' | npx wrangler secret put SUPABASE_URL
  ```

  Using `printf '%s'` avoids appending a newline that would corrupt the secret. Do NOT use `echo` without `-n`.

- [ ] Set production `SUPABASE_KEY` (anon key — the same one already in `.dev.vars`):

  ```sh
  printf '%s' '<value>' | npx wrangler secret put SUPABASE_KEY
  ```

- [ ] Verify both secrets are registered (names only; values not retrievable):

  ```sh
  npx wrangler secret list
  ```

  Expect a JSON array containing `SUPABASE_URL` and `SUPABASE_KEY` with `type: "secret_text"`.

- [ ] Run a clean build: `rm -rf dist .astro && npx astro sync && npm run build`.
- [ ] Deploy: `npx wrangler deploy`. (Add `--yes` only if a confirmation prompt appears.)
- [ ] **Capture the bundle size** from the deploy output line `Total Upload: X.XX KiB / gzip: Y.YY KiB`. Note the gzipped size — the Workers bundle ceiling is 3 MB gzipped; flag if `Y.YY > 2 MB` (early-warning headroom). Record the number in the runbook.
- [ ] Capture the deployed URL — it will be `https://investment-assistant.<your-subdomain>.workers.dev` (the rename in Phase 1 ensures this URL reflects the product name, not the starter template).
- [ ] **Smoke test 1 (asset + entrypoint):** `curl -sSI https://investment-assistant.<subdomain>.workers.dev/` — expect HTTP 200 and `cf-ray` header.
- [ ] **Smoke test 2 (SSR + Supabase wake-up):** open `https://investment-assistant.<subdomain>.workers.dev/auth/signin` in a browser — expect the sign-in page rendered, no 500. This proves SSR boots and the Supabase SSR client constructs.
- [ ] **Smoke test 3 (middleware + nodejs_compat at runtime):** hit a route that goes through the Supabase auth middleware (e.g. a protected page or any route that reads `Astro.locals.user`). Expect either a redirect to sign-in or the rendered page — **not** a workerd `nodejs_compat` runtime error. Build success ≠ runtime success on workerd; this is the only check that confirms `nodejs_compat` resolves at request time.
- [ ] **Smoke test 4 (logs):** in another terminal, run `npx wrangler tail` and reload `/auth/signin`. Confirm a log line appears with no uncaught exception.
- [ ] Add to `package.json` `scripts`:

  ```json
  "deploy": "astro build && wrangler deploy"
  ```

  Run `npm run deploy` once locally to confirm the script path works end-to-end. (Subsequent deploys are `npm run deploy` — that is the canonical production push for this project.)

- [ ] Commit: `wrangler.jsonc`, `package.json`, `context/foundation/tech-stack.md`. Do NOT commit anything secret-shaped.

**Verification:**

- `wrangler deploy` reports `Current Version ID: <uuid>` and a non-zero `Total Upload`.
- `wrangler secret list` returns both SUPABASE keys.
- Browser smoke tests 2 and 3 render without 500.
- `wrangler tail` shows clean request logs.
- `npm run deploy` (re-run) deploys cleanly and reports a new Version ID.

**Rollback / if it fails:**

- Runtime error on `/auth/signin`: run `npx wrangler rollback` (defaults to previous version). Cloudflare retains a best-effort window of recent versions — the count is **not contractually documented**, treat as ~last few. For older reverts: `git checkout <sha> && npm run deploy`.
- Bad secret value: re-run `printf '%s' '<corrected>' | npx wrangler secret put SUPABASE_KEY`. Worker restarts on next request with the new value.
- OAuth session expired mid-deploy: `npx wrangler login` then retry. Deploy is idempotent.

---

## Phase 4 — Hardening (pre-commit guards + runbook)

**Goal:** Prevent the two highest-impact regressions (secrets leaking into `wrangler.jsonc`, stale Pages commands creeping back in), and document operational basics so the next session — yours or an agent's — has a runbook.

- [ ] Create `scripts/check-wrangler-secrets.mjs` (committed, runs in pre-commit):

  ```js
  // Fails the commit if wrangler.jsonc contains a secret-shaped value.
  // Patterns flagged:
  //   - JWT-shaped strings (eyJ... three base64url segments)
  //   - SUPABASE_KEY value embedded as a literal
  //   - top-level `vars` block with secret-shaped keys (we use `wrangler secret put`)
  import { readFileSync, existsSync } from "node:fs";

  const path = "wrangler.jsonc";
  if (!existsSync(path)) process.exit(0);
  const src = readFileSync(path, "utf8");

  const failures = [];
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/.test(src)) {
    failures.push("JWT-shaped string found in wrangler.jsonc — use `wrangler secret put`.");
  }
  if (/SUPABASE_KEY\s*[:=]\s*["'][^"']+["']/.test(src)) {
    failures.push("SUPABASE_KEY value found in wrangler.jsonc — use `wrangler secret put`.");
  }
  if (/"vars"\s*:\s*\{[^}]*(?:KEY|SECRET|TOKEN)[^}]*\}/i.test(src)) {
    failures.push("`vars` block in wrangler.jsonc contains secret-shaped key — move to `wrangler secret put`.");
  }
  if (failures.length) {
    console.error("[pre-commit] wrangler.jsonc secrets-leak guard failed:");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  ```

- [ ] Update `.husky/pre-commit` to:

  ```sh
  npx lint-staged
  node scripts/check-wrangler-secrets.mjs
  if grep -RIn "wrangler pages" package.json .github/workflows/ 2>/dev/null; then
    echo "[pre-commit] ERROR: 'wrangler pages' command detected — this project deploys to Workers." >&2
    exit 1
  fi
  ```

- [ ] Verify the guard locally:
  - `node scripts/check-wrangler-secrets.mjs` on the current `wrangler.jsonc` → exits 0.
  - Temporarily add `"vars": {"SUPABASE_KEY": "eyJabc.def.ghi"}` to a copy and re-run → exits 1 with both messages. Discard the test edit.
  - Add `"deploy:pages": "wrangler pages deploy"` to `package.json` scripts as a test, run `git add package.json && git commit -m "test"` → must be blocked. Discard.
- [ ] Create `context/deployment/runbook.md` (separate from this plan; runbook is a living doc, plan is one-shot). Contents below.
- [ ] Commit `scripts/check-wrangler-secrets.mjs`, `.husky/pre-commit`, `context/deployment/runbook.md`.

### Runbook content (target: `context/deployment/runbook.md`)

```markdown
# investment-assistant — Cloudflare Workers Operational Runbook

## Quick reference

- Worker name: `investment-assistant`
- URL: `https://investment-assistant.<subdomain>.workers.dev`
- Deploy: **manual, local only** — `npm run deploy` from the dev's machine
- Auth: `wrangler login` (OAuth) — broad account privileges, accepted for solo MVP
- Adapter: `@astrojs/cloudflare` (SSR via `_worker.js`, static via ASSETS binding)
- Account ID: `<fill in from wrangler whoami>`

## Routine deploy

- `npm run deploy` (= `astro build && wrangler deploy`).
- After deploy, run the four smoke tests from the deploy plan (curl `/`, browser `/auth/signin`,
  protected route, `wrangler tail`).
- If `wrangler whoami` reports an expired OAuth session, run `npx wrangler login` and retry.

## Rollback

- **Most recent N deploys (best effort)**: `npx wrangler rollback` (interactive picker) or
  `npx wrangler rollback --version-id <uuid>`.
- Cloudflare retains a best-effort window of recent versions. The count is **not contractually
  documented** — treat anything older than ~last few deploys as unavailable via `rollback`.
- **Older revert**: `git checkout <good-sha> && npm run deploy`.

## Secret rotation

- `printf '%s' '<new-value>' | npx wrangler secret put SUPABASE_KEY`
- New value applies on the next request — no redeploy required.
- Local dev: also update `.dev.vars` (gitignored) so `npm run dev` matches production.

## Logs

- Live tail: `npx wrangler tail` (filter: `--status error`, `--method POST`, etc.)
- Dashboard: Workers & Pages → `investment-assistant` → Logs (observability is enabled in
  `wrangler.jsonc`).

## Free tier 429 cliff

- Free plan: 100,000 requests/day, hard cutoff. **Past the limit, requests return user-visible
  HTTP 429** — there is no overage billing.
- Recommendation: upgrade to the $5/month paid plan **before public dogfooding** to avoid
  surprise outages.

## Bundle size ceiling

- Workers bundle limit: **3 MB gzipped**. First-deploy gzipped size: **<fill in after Phase 3>**.
- Re-check after adding heavy deps (chart libraries, markdown processors, AI client SDKs).
  `npm run build && npx wrangler deploy --dry-run` prints the projected size without uploading.

## prerenderEnvironment caveat

- Astro 6 supports `export const prerenderEnvironment = 'node'` per page for static pages that
  import Node-only libraries at build time.
- **Failure mode**: build succeeds but the page errors at first runtime request on workerd. There
  is no static check.
- Rule: any new static page that imports a Node-only lib (filesystem, native modules) MUST set
  `prerenderEnvironment: 'node'` explicitly.

## nodejs_compat scope

- Currently enabled globally via `compatibility_flags: ["nodejs_compat"]` in `wrangler.jsonc`.
- Required for `@supabase/ssr` (uses `node:crypto`, `node:buffer`).
- If a future dep needs a wider polyfill, prefer adding to `compatibility_flags` over editing the
  adapter.

## Stale Pages-shaped commands

- Pre-commit hook (`.husky/pre-commit`) greps for `wrangler pages` in `package.json` and
  `.github/workflows/`. If it fires, replace with the Workers equivalent: `wrangler deploy`
  (not `wrangler pages deploy`), `wrangler tail` (not `wrangler pages deployment tail`).

## Contract-drift check

- `context/foundation/tech-stack.md` frontmatter `deployment_target` must say
  `cloudflare-workers`. If it ever drifts back to `cloudflare-pages`, an agent will scaffold the
  wrong CI/adapter on the next refactor.

## Future-revisit: auth posture

- Currently using `wrangler login` (OAuth). This ties production deploy to one human's
  Cloudflare account login and grants broad privileges. Acceptable for solo MVP local deploys.
- **Revisit when**: a second person needs to deploy, CI deploy is added, or this leaves the
  dev's machine. The replacement is a scoped API token (`Workers Scripts:Edit` +
  `Account Settings:Read` + `User Details:Read` for this account only) stored in a password
  manager / CI secret store.

## Future-revisit: CI deploy

- Currently no GitHub Actions deploy job — production pushes are manual local `npm run deploy`.
- **Revisit when**: deploy cadence picks up, you forget to deploy after a merge, or a second
  contributor joins. The infrastructure-research file's "Getting Started" section sketches the
  CI deploy job; pair it with the scoped-token migration above.
```

**Verification:**

- `git commit` of a benign change runs the new pre-commit guard and exits 0.
- Manually injecting a JWT-shaped string into a copy of `wrangler.jsonc` and running the script directly exits 1.
- Manually adding `"deploy:pages": "wrangler pages deploy"` to a test branch is blocked by the pre-commit hook.
- `runbook.md` exists at `context/deployment/runbook.md` with the bundle size and account ID filled in.

**Rollback / if it fails:**

- Pre-commit guard false positive on a legitimate edit: run `git commit --no-verify` once, then refine the regex in `scripts/check-wrangler-secrets.mjs`. Do not delete the script.
- The runbook is documentation only; no production rollback needed.

---

## Definition of Done (whole plan)

- [ ] **Phase 1**: `wrangler.jsonc` + `package.json` renamed to `investment-assistant`, `tech-stack.md` patched, local build green.
- [ ] **Phase 2**: `wrangler whoami` returns the expected account; no surprise pre-existing Worker by the same name.
- [ ] **Phase 3**: first manual deploy live at `https://investment-assistant.<subdomain>.workers.dev`, secrets registered, four smoke tests pass, `npm run deploy` script in `package.json`, gzipped bundle size recorded.
- [ ] **Phase 4**: pre-commit guard blocks both attack patterns; `runbook.md` written.

---

## End-to-end verification (after all phases)

1. **Round-trip**: make a small copy change locally, run `npm run deploy`, hit the live URL, confirm the change is live.
2. **Rollback drill**: while still on a recent deploy window, run `npx wrangler rollback` against a non-critical previous version, confirm previous content serves, then `npm run deploy` to return to head. (Safe because no migrations are tied to this rollback window.)
3. **Secret rotation drill**: rotate `SUPABASE_KEY` in Supabase dashboard, run `printf '%s' '<new>' | npx wrangler secret put SUPABASE_KEY`, also update `.dev.vars`, hit `/auth/signin`, confirm auth still works.
4. **Guard verification**: try to commit a `wrangler.jsonc` containing a JWT-shaped string — the pre-commit guard must block it.
