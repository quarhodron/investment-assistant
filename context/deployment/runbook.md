# investment-assistant — Cloudflare Workers Operational Runbook

## Quick reference

- Worker name: `investment-assistant`
- URL: `https://investment-assistant.dawid-nazarko.workers.dev`
- Deploy: **manual, local only** — `npm run deploy` from the dev's machine
- Auth: `wrangler login` (OAuth) — broad account privileges, accepted for solo MVP
- Adapter: `@astrojs/cloudflare` (SSR via `_worker.js`, static via ASSETS binding)
- Account ID: `c73172f88c8ffd2bb5c67424fd9b9cd0`
- First-deploy bundle size: **1911.73 KiB / gzip 391.08 KiB** (~382 KB gzipped)

## Local dev: RLS smoke test

After `npx supabase db reset`, run the RLS verification harness to confirm per-user isolation and
analysis immutability hold:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/rls_smoke.sql
```

Success: silent (every assertion holds). Failure: a `FAIL:` exception from the first violated
assertion. The script runs inside a single transaction and rolls back all test data on exit.

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

## Encryption key (F-02)

`ENCRYPTION_KEY` is the master key from which every per-user AES-GCM subkey is derived (HKDF-SHA-256, info `f02-api-keys-v1`). It MUST be a base64-encoded 32-byte value.

### Generate

```bash
openssl rand -base64 32
```

### Install locally

Append to `.dev.vars` (gitignored):

```bash
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .dev.vars
```

Verify the round-trip works:

```bash
node scripts/encrypt-roundtrip.mjs
```

### Install in production

```bash
printf '%s' '<base64-value>' | npx wrangler secret put ENCRYPTION_KEY
```

### Rotation (v1 strategy — placeholder)

The persisted ciphertext envelope includes `{"v":1,...}` so rotation is routine:

1. Generate a new key, install it as `ENCRYPTION_KEY_V2` (new secret).
2. Ship a code change that bumps `v` to `2` for new writes and continues decrypting `v:1` blobs with the old key.
3. Run a one-shot `scripts/rotate-keys.mjs` (not yet authored — author when first rotation is needed) that pages `user_settings`, decrypts under v1, re-encrypts under v2, writes back.
4. Drop `ENCRYPTION_KEY_V1` from secrets.

The version field is what makes this routine; never store ciphertext without it.

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

- Workers bundle limit: **3 MB gzipped**. First-deploy gzipped size: **391.08 KiB** (~13 % of
  ceiling). Ample headroom; flag if a future deploy crosses 2 MB gzipped.
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

## SESSION KV namespace (auto-provisioned)

- `wrangler deploy` auto-provisioned a KV namespace for Astro sessions on first deploy:
  `e22478b26b374fdc8e28a670bd592309` (binding `SESSION`).
- Bound automatically; no action needed unless you want to clear sessions (delete via
  dashboard → Workers KV).

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
