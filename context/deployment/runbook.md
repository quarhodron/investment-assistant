# investment-assistant — Cloudflare Workers Operational Runbook

## Quick reference
- Worker name: `investment-assistant`
- URL: `https://investment-assistant.dawid-nazarko.workers.dev`
- Deploy: **manual, local only** — `npm run deploy` from the dev's machine
- Auth: `wrangler login` (OAuth) — broad account privileges, accepted for solo MVP
- Adapter: `@astrojs/cloudflare` (SSR via `_worker.js`, static via ASSETS binding)
- Account ID: `c73172f88c8ffd2bb5c67424fd9b9cd0`
- First-deploy bundle size: **1911.73 KiB / gzip 391.08 KiB** (~382 KB gzipped)

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
