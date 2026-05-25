---
project: investment-assistant
researched_at: 2026-05-24
recommended_platform: cloudflare-workers
runner_up: vercel
context_type: mvp
tech_stack:
  language: typescript
  framework: astro-6
  runtime: cloudflare-workers
---

## Recommendation

**Deploy on Cloudflare Workers (with Static Assets binding).**

Cloudflare Workers is the recommended target for three reasons specific to this stack: (1) the project already pins `@astrojs/cloudflare ^13.5.0` and `wrangler ^4.90.0`, so the adapter is wired and `astro dev` already runs in `workerd` for local fidelity; (2) Workers' execution model decouples CPU time from wall-clock time during `fetch` awaits, so AI streaming over SSE from Anthropic / OpenAI runs effectively unbounded as long as the client stays connected — a structural fit for the product's continue-analysis flows; (3) Free tier covers the MVP scale envelope (small users, low qps, no realtime), and the only paid bill at modest growth is the standard $5/month Workers plan. The runner-up is Vercel, which scores identically on every agent-friendly criterion and has a GA MCP server, but its Hobby tier is explicitly non-commercial — meaning $20/month Pro from day one if the app monetizes — and its strongest adjacent feature (Fluid Compute) does not provide a meaningful win for this specific app's I/O pattern over Workers' streaming model.

> Important platform-correctness note: `tech-stack.md` records `deployment_target: cloudflare-pages`, but `@astrojs/cloudflare` v13 (current, pinned) **dropped Cloudflare Pages support — Workers is the only target**. Any deploy plan referencing `wrangler pages deploy` is wrong for this stack. The deploy command is `wrangler deploy`. This contract drift is captured in the risk register and must be reconciled in `tech-stack.md` before `/10x-implement` runs.

## Platform Comparison

Six platforms scored against the five agent-friendly criteria from `references/agent-friendly-criteria.md`. No hard filters disqualified anyone (the app does not require persistent connections; every platform supports the Astro 6 / Node 22 / TS runtime via the appropriate adapter).

| Platform               | CLI-first                                                    | Managed/Serverless                                                          | Agent-readable docs                                                  | Stable deploy API                              | MCP / agent integration                                                    | Total   |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- | ------- |
| **Cloudflare Workers** | Pass                                                         | Pass                                                                        | Pass (`llms.txt` per product)                                        | Pass (`wrangler deploy --yes`)                 | Partial (14 servers, marked "WIP" by maintainers, OAuth-gated)             | **4.5** |
| **Vercel**             | Pass                                                         | Pass                                                                        | Pass (`llms-full.txt`)                                               | Pass (`vercel --prod`, `rollback`, `promote`)  | Pass (Vercel MCP GA at `mcp.vercel.com`, OAuth, Claude Code native)        | **5.0** |
| **Railway**            | Pass                                                         | Pass                                                                        | Pass (`llms-full.txt`, ~55k words)                                   | Pass (`railway up`, `redeploy`, `--json`/`-y`) | Pass (GA MCP, `railway setup agent`, Remote MCP added Apr 2026)            | **5.0** |
| **Netlify**            | Partial (no first-class `rollback` / `logs tail` subcommand) | Pass                                                                        | Pass (`llms.txt`)                                                    | Pass (`netlify deploy --prod`)                 | Pass (`@netlify/mcp` GA, but no logs tool exposed)                         | **4.5** |
| **Render**             | Pass (real CLI v2.18+ since 2025)                            | Pass                                                                        | Pass (`llms.txt` + `llms-full.txt`, `.md` suffix everywhere)         | Pass (CLI + `render.yaml` blueprint API)       | Partial (hosted MCP, but read-mostly: cannot modify/delete most resources) | **4.5** |
| **Fly.io**             | Pass                                                         | Partial (mandatory hand-written Dockerfile; no scanner-grade Astro support) | Partial (no `llms.txt` at canonical path; markdown source on GitHub) | Pass (`flyctl deploy`, `releases`, `--json`)   | Fail (no confirmed first-party MCP as of 2026-05-24)                       | **3.0** |

### Soft-weight adjustments from the developer interview

- Q1 (no persistent connections required) — no platforms dropped; serverless options (Vercel, Netlify) stay in.
- Q2 (cost vs DX neutral) — no tilt. Both top picks land in the same $0–$5/month band at MVP traffic.
- Q3 (no platform familiarity) — no familiarity tiebreaker; what was already in the scaffold (Cloudflare) only counts as a soft tilt for adapter-swap cost, not familiarity.
- Q4 (single-region traffic) — neutralizes Cloudflare's edge-CDN advantage but does not penalize.
- Q5 (external Supabase, no co-location needed) — drops Railway's main differentiator (co-located Postgres / Redis), evens its score with Vercel on this app specifically.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already wired in the scaffold (`@astrojs/cloudflare ^13.5.0`, `wrangler ^4.90.0`) and `astro dev` runs in `workerd` so local matches production. Free tier (100k requests/day, 10ms CPU per request, **CPU time decoupled from wall-clock during `fetch` awaits**) covers MVP scale with room. Static Assets binding is free and unmetered for the static portion of the build. AI streaming over SSE works as a pass-through `ReadableStream` in the `fetch` handler — pure pass-through is "already optimal" per Cloudflare docs and does not consume the CPU budget while waiting on upstream tokens. Bonus: Anthropic / OpenAI SDK calls can run as long as the client stays connected. Trade-offs: the MCP servers are flagged "still a work in progress" by Cloudflare's own README, the 3 MB gzipped bundle ceiling is real (current scaffold is comfortable but adding chart libraries without tree-shaking discipline will press it), and the Free tier returns 429 on overage rather than charging.

#### 2. Vercel

Tied for top score (5.0). One-command adapter swap (`npx astro add vercel`). Vercel MCP is GA at `mcp.vercel.com` with native Claude Code support — the cleanest agent-operator story of any candidate. Fluid Compute (GA, default-on since 2025-04-23) is purpose-built for I/O-bound AI workloads and provides 300s default duration on Hobby, 800s max on Pro. The blocker for "use it instead" is commercial: **Hobby is non-commercial-use only**, so the moment this app becomes a paid product the floor becomes Pro at $20/month — versus Workers' $5/month base. Vercel KV / Blob / Postgres are optional, not forced; Supabase coexists fine.

#### 3. Railway

Tied for top score (5.0). GA MCP via `railway setup agent`, full Node.js runtime with no platform-imposed request-duration cap (genuine win for very long AI streams), Railpack auto-detects Astro, $5/month Hobby plan with $5 of usage credit included — realistic monthly bill at MVP traffic is $5–$10. Trade-offs for this app specifically: the headline Railway draw (co-located Postgres/Redis on the same platform) is irrelevant because Supabase is already the data layer; the adapter swap to `@astrojs/node` is mechanical but real; and the optional Serverless sleep mode misreads SSE handlers (which are inbound-only) as idle, so it must be disabled for AI streaming.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **`tech-stack.md` says `deployment_target: cloudflare-pages` but `@astrojs/cloudflare` v13 dropped Pages support.** Anyone building a deploy plan from that line literally will write a `wrangler pages deploy` workflow that emits no SSR — silent breakage on the first dynamic route. The fix is mechanical, but the contract drift between `tech-stack.md` and `infrastructure.md` must be caught before `/10x-implement` runs.
2. **Cloudflare's 14 first-party MCP servers are flagged "still a work in progress" by the maintainers.** Vercel, Netlify, and Railway MCPs are GA today. For a solo dev relying on the agent for logs / deploys / secrets management, this is a real maturity gap. The fallback `wrangler tail` is interactive and requires a local terminal.
3. **Free tier 100k req/day cliff returns 429, not overage charges.** A single dogfooding day with chained continue-analysis runs and page reloads can spike close to the ceiling if static-asset caching is misconfigured. A user-facing 429 mid-analysis is a worse failure mode than a small overage charge would have been.
4. **`workerd` is not Node.** Even with `nodejs_compat`, the next dependency added (PDF parser, native sanitizer, charting library that uses `Buffer` deep in its tree) may build cleanly and fail at runtime. Fly / Railway / Render do not carry this class of risk because they run real Node.
5. **3 MB gzipped bundle ceiling.** Astro 6 + React 19 + shadcn/ui + Supabase SSR + Anthropic + OpenAI SDKs sit comfortably in the 1–2 MB range today, but adding a charting library (`recharts`, `chart.js`) or a heavy date / markdown library without tree-shaking discipline will push past 3 MB. This is an MVP-time tax that Node-VM platforms do not impose.

### Pre-Mortem — How This Could Fail

It's October 2026. The MVP launched in mid-June and ran cleanly for three weeks. Then the user added a "compare two analyses side-by-side" feature that loaded both parent AI outputs verbatim into a new request — chain depth grew, payloads grew, and long streams started getting cut off mid-token. The user assumed the issue was `astro:env` or Supabase cookie handling and spent two days debugging auth before realizing the request body was hitting a Worker subrequest limit, not a timeout. Worse, while shipping the fix the dev re-ran `wrangler pages deploy` from a stale shell-history entry — it succeeded against the legacy Pages project but did not touch the live Worker, so production stayed on a build three days old. By the time everything was diagnosed, the weekend planned for the watchlist feature was gone, the bundle had crossed 3 MB after adding `recharts`, and they reluctantly migrated to Railway — losing two weeks rebuilding what would have been a 30-minute adapter swap on day one.

### Unknown Unknowns

- **`prerenderEnvironment: 'node'` is a per-page decision the agent must remember to flip.** A static page that imports a Node-only package builds fine but errors at runtime under `workerd`, on first request to that page in production. No lint rule catches this.
- **`wrangler secret put` vs `wrangler.jsonc` `vars` are not interchangeable.** Secrets pasted into `vars` get committed plaintext. Docs show both side by side; `astro:env/server` types accept both. One-line slip → key rotation.
- **CPU time is per-request, not per-Worker.** Streaming an LLM response is wall-clock-charged via `fetch`, but any **in-Worker JSON parse, markdown render, or compression** of a large completion counts as CPU and will trip Worker limits on Free once outputs grow.
- **`wrangler rollback` only sees ~10 recent deploys.** Long-tail rollback is a manual `git checkout` + `wrangler deploy`. Document the runbook before 2 AM, not during.
- **Astro 6 prerender environment changed under this adapter major.** Astro 6 + adapter v13 prerenders pages in `workerd` by default; the older Node-prerender behavior must be opted into per page if a build-time-only Node API is used.

## Operational Story

How Cloudflare Workers actually operates day to day for this project. One concrete answer per axis.

- **Preview deploys**: every `wrangler deploy` to a non-production environment yields a `*.workers.dev` URL. Branch-aliased previews come from running `wrangler deploy --env <branch>` in CI; protect them with Cloudflare Access if shared. Fork-PR previews require a token in the fork (skip them — review on the PR diff and run main-branch previews).
- **Secrets**: `wrangler secret put SUPABASE_KEY` (piped stdin: `echo "$VALUE" | wrangler secret put SUPABASE_KEY`) — values are write-only, never readable back, exposed to the Worker as `astro:env/server` bindings. **Do not** put secrets in `wrangler.jsonc` `vars` (committed plaintext). Rotation flow: rotate at Supabase, then `wrangler secret put` overwrites in place; restart not required. CI uses `CLOUDFLARE_API_TOKEN` scoped to this Worker only — no DNS, no other Workers, no billing.
- **Rollback**: `wrangler rollback --message "reason"` reverts to the previous deployment without the confirmation prompt; ~10 recent deploys are visible. Older revert = `git checkout <sha>` + `wrangler deploy`. Time-to-revert: ~30 seconds. **Caveat**: Supabase migrations do not roll back automatically — back out the SQL by hand or with a paired down-migration before `wrangler rollback` if the broken deploy ran a migration.
- **Approval**: agent may run `wrangler deploy` to preview environments, `wrangler tail` for live logs, `wrangler secret list` (names only). Human-only: `wrangler deploy` to production, `wrangler secret put` for primary credentials, any Supabase schema migration that destroys data, deleting the Worker.
- **Logs**: `wrangler tail` streams live structured logs in the terminal. For historical / agent-readable access, configure the workers-observability MCP server (OAuth-gated, marked WIP — usable for read queries against logs and metrics). Logpush to Supabase / R2 is the production-grade path when ad-hoc queries grow tedious.

## Risk Register

| Risk                                                                                                                                                                | Source                              | Likelihood                                          | Impact                  | Mitigation                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tech-stack.md` says `cloudflare-pages` but adapter v13 only targets Workers; downstream skills (`/10x-bootstrapper`, `/10x-implement`) consume the wrong contract. | Devil's advocate                    | High                                                | High                    | Patch `tech-stack.md` `deployment_target: cloudflare-workers` before running `/10x-implement`. Add a short "Pages → Workers migration" note in `lessons.md` via `/10x-lesson`.                                              |
| Cloudflare MCP servers are still "work in progress"; agent operability for logs / deploys / secrets is weaker than Vercel / Railway / Netlify.                      | Devil's advocate                    | Medium                                              | Medium                  | Start with `wrangler` CLI as the primary agent surface (which is GA and stable). Add the workers-observability MCP server only when log-querying becomes a recurring agent pattern. Re-evaluate at `/10x-rule-review` time. |
| Free tier 429 cliff under traffic spike (100k req/day) returns user-visible errors mid-analysis.                                                                    | Devil's advocate / Pre-mortem       | Low at MVP traffic, Medium during dogfooding bursts | High (analysis loss)    | Move to $5 paid plan before public dogfooding. Configure aggressive Static Assets caching headers so the Worker is invoked only for SSR routes, not assets.                                                                 |
| `nodejs_compat` does not cover every Node API a future dependency might need; build succeeds, runtime fails.                                                        | Devil's advocate / Unknown unknowns | Medium (grows with dep count)                       | Medium                  | Add a smoke-test deploy step in CI that hits one SSR route after deploy and fails the workflow on non-2xx. Audit each new dep for `node:fs` / `node:net` / native modules before adding.                                    |
| 3 MB gzipped bundle ceiling pressed by chart / date / markdown libraries added after MVP.                                                                           | Devil's advocate / Pre-mortem       | Medium (timeline-dependent)                         | Medium                  | Run `wrangler deploy --dry-run --outdir` on every PR; fail CI if compressed bundle > 2.5 MB (early-warning headroom).                                                                                                       |
| Stale `wrangler pages deploy` invocation deploys against a legacy Pages project, leaving the live Worker on an old build.                                           | Pre-mortem                          | Low (tooling), High (if it happens)                 | High (silent staleness) | Remove any Pages project from the Cloudflare account before first Workers deploy. Add a CI check that fails on `wrangler pages` substring in `package.json` scripts or workflows.                                           |
| `prerenderEnvironment` per-page decision is silent; Node-only build-time imports fail at runtime under `workerd`.                                                   | Unknown unknowns                    | Low                                                 | Medium                  | When introducing a static page that uses a Node-only library, set `prerenderEnvironment: 'node'` explicitly in adapter config; document the convention in `lessons.md`.                                                     |
| Secrets accidentally committed via `wrangler.jsonc` `vars` instead of `wrangler secret put`.                                                                        | Unknown unknowns                    | Low (process discipline)                            | High (key leak)         | Add a pre-commit hook (`husky` is already in the project) that fails on common secret patterns inside `wrangler.jsonc`. Rotate Supabase service-role key on first detection.                                                |
| Continue-analysis chains grow large enough to hit Worker request body / subrequest limits before token cost surfaces the problem.                                   | Pre-mortem                          | Low at v1 scale                                     | Medium                  | Track parent-output token count in `analyses` table; surface the count in the continue-analysis flow before sending. Defer to v2 token-cost work captured in PRD Open Questions.                                            |
| Supabase migration deployed alongside a broken Worker version cannot be rolled back together by `wrangler rollback`.                                                | Research finding                    | Low                                                 | High (data corruption)  | Always pair a Supabase migration with a forward-fix-only deploy strategy: ship migration first behind a feature flag, ship Worker code second, never bundle.                                                                |

## Getting Started

These steps are accurate against the **versions actually pinned in this project** (`@astrojs/cloudflare ^13.5.0`, `wrangler ^4.90.0`, Astro 6.3.x, Node 22.14.0). Do not copy commands verbatim from Cloudflare or Astro general docs — they often show legacy Pages flows or pre-v13 adapter syntax.

1. **Reconcile `tech-stack.md`.** Open `context/foundation/tech-stack.md` and change `deployment_target: cloudflare-pages` to `deployment_target: cloudflare-workers`. This is a contract correction, not a stack change — same vendor, same adapter, the Pages vs Workers split is a Cloudflare internal SKU change that v13 of the adapter resolved by going Workers-only.
2. **Confirm `wrangler.jsonc` (or `wrangler.toml`) is Workers-shaped.** It must contain at minimum:
   ```jsonc
   {
     "name": "investment-assistant",
     "main": "./dist/_worker.js/index.js",
     "compatibility_date": "2025-09-15",
     "compatibility_flags": ["nodejs_compat"],
     "assets": { "directory": "./dist", "binding": "ASSETS" },
   }
   ```
   The `assets` binding is what serves the static portion of the Astro build for free; `nodejs_compat` is what unlocks `node:buffer` / `node:crypto` for Supabase SSR.
3. **Set secrets via `wrangler secret put`, not via `vars`.** For each `astro:env/server` secret declared in `astro.config.mjs` (`SUPABASE_URL`, `SUPABASE_KEY`, plus future `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` once added):
   ```bash
   echo "$VALUE" | npx wrangler secret put SUPABASE_KEY
   ```
   For local dev keep using `.dev.vars` (already in `.gitignore`).
4. **First deploy.** From a clean working tree:
   ```bash
   npm run build && npx wrangler deploy --yes
   ```
   This emits a `https://investment-assistant.<your-subdomain>.workers.dev` URL. Hit `/auth/signin` to confirm the Supabase SSR client wakes up cleanly.
5. **Wire the GitHub Actions deploy.** The repo already has `.github/workflows/ci.yml` running lint + build. Add a second job that runs `npx wrangler deploy --yes` on push to `master`, gated on the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets (token scoped to this Worker only — no DNS, no billing, no other Workers).

## Out of Scope

The following were not evaluated in this research and remain to be addressed elsewhere in the chain:

- Docker image configuration — not applicable to Workers; if the platform decision is ever revisited toward Fly.io / Railway / Render, a Dockerfile becomes part of `/10x-implement`'s scope.
- CI/CD pipeline detail — the existing `.github/workflows/ci.yml` runs lint + build; the deploy job is sketched in "Getting Started" but full CI design (environment matrices, branch protection, status check requirements) is `/10x-implement` territory.
- Production-scale architecture — multi-region failover, dedicated SLA tiers, Logpush + structured-logs warehousing, paid Workers Logpush destinations. Not relevant at v1 scale (small users, low qps per `prd.md`); revisit at the v2 trigger documented in `prd.md` Open Questions.
