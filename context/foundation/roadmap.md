---
project: Investment Assistant
version: 1
status: draft
created: 2026-05-26
updated: 2026-05-26
prd_version: 1
main_goal: market-feedback
top_blocker: time
---

# Roadmap: Investment Assistant

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Retail amateur investors with day jobs paste one-off prompts into general-purpose AI chat tools today, lose the answers in chat history, and start over each session. Investment Assistant is a research workspace where prompts, analyses, and watched companies are linked as a domain — and where the same analysis can be continued with a different prompt or model without starting from a blank page. The product wedge — the one trait that, if removed, makes the product indistinguishable from generic AI chat — is the **continue-analysis chain**: an analysis whose parent's full AI output is forwarded verbatim as context for a follow-up run that swaps prompt and/or model, with the chain preserved as durable history.

## North star

**S-02: User can run "Continue analysis" from a saved analysis with a different prompt and/or model, and the new analysis is saved as a child of the parent.** This is the validation milestone — the smallest end-to-end slice whose successful delivery would prove the core product hypothesis (that continuing an analysis with a swapped prompt/model produces useful research forward) — placed as early as Prerequisites allow because everything else only matters if this works. S-01 ships immediately before it because you can't continue an analysis that doesn't exist.

## At a glance

| ID    | Change ID                          | Outcome (user can …)                                                                          | Prerequisites | PRD refs                                                                                  | Status   |
| ----- | ---------------------------------- | --------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- | -------- |
| F-01  | data-schema-and-rls                | (foundation) per-user isolated schema for prompts, analyses, watched companies, settings live | —             | Access Control §Isolation, NFRs §isolation, FR-020                                        | ready    |
| F-02  | api-keys-and-ai-provider-client    | (foundation) per-user API keys stored encrypted; thin AI client streams Anthropic / OpenAI    | F-01          | FR-028, FR-032, Business Logic #2                                                         | proposed |
| S-01  | first-analysis-other-topic         | run their first analysis on a free-text "other" topic and reopen the saved result             | F-01, F-02    | US-01, FR-006, FR-007, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-028, FR-029, FR-030, FR-032 | proposed |
| S-02  | continue-analysis-chain            | continue a saved analysis with a different prompt and/or model, with the chain preserved      | S-01          | FR-018, Business Logic #2                                                                 | proposed |
| S-03  | filter-analyses-list               | filter and sort the analyses list by date, type, and associated company                       | S-01          | FR-017                                                                                    | proposed |
| S-04  | prompts-management                 | edit and delete saved prompts; prior analyses retain their snapshot                           | S-01          | FR-008, FR-009                                                                            | proposed |
| S-05  | watchlist-crud                     | add, list, view, edit, and delete watched companies; deletes preserve tied analyses           | F-01          | FR-021, FR-022, FR-023, FR-027                                                            | proposed |
| S-06  | company-bound-analysis             | run a saved prompt against a watched company and continue that chain from the company view   | S-02, S-05    | FR-010 (company branch), FR-024, FR-025, FR-026, Business Logic #3                        | proposed |
| S-07  | promote-company-from-result        | open the watchlist add-form from an analysis detail view and back-link the originating analysis | S-01, S-05    | FR-019                                                                                    | proposed |
| S-08  | dashboard-recent                   | see recent analyses and watched companies on the Dashboard as a quick-nav surface             | S-01, S-05    | FR-031                                                                                    | proposed |
| S-09  | password-reset                     | request a password reset link via email and set a new password                                | —             | FR-001, FR-002, FR-003, FR-004, FR-005                                                    | ready    |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                            | Chain                                  | Note                                                                                       |
| ------ | -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| A      | Wedge (validation milestone)     | `F-01` → `F-02` → `S-01` → `S-02`      | Path to the north star. `main_goal: market-feedback` means everything else waits on this.  |
| B      | Workspace navigation             | `S-03` → `S-04` → `S-08`               | Read-side polish; sequenced after the wedge ships. Joins Stream A at `S-01`.                |
| C      | Company-bound research           | `S-05` → `S-06` → `S-07`               | Second wedge prong (watchlist-injected prompts). `S-06` joins Stream A at `S-02`; `S-07` joins Stream A at `S-01`. |
| D      | Auth completeness                | `S-09`                                 | Closes the FR-005 gap; can ship anytime — no foundation prerequisite.                       |

## Baseline

What's already in place in the codebase as of `2026-05-26` (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 + React 19 + Tailwind 4; pages `index`, `dashboard`, `auth/{signin,signup,confirm-email}`; `Layout.astro`, `Topbar`, `Banner`, `Welcome` shells; shadcn/ui configured (only `button.tsx` installed — pull more via `npx shadcn add` per slice).
- **Backend / API:** partial — only `/api/auth/{signin,signup,signout}` real handlers; no business-logic services, no validation library installed.
- **Data:** absent — `@supabase/supabase-js` in deps, but `supabase/migrations/` empty, no application tables, no seed, no RLS. F-01 owns this gap.
- **Auth:** partial — Supabase SSR client + `src/middleware.ts` + signin/signup/signout/confirm-email all real handlers; password reset (FR-005) missing — covered by S-09 as a non-blocking slice, not a foundation.
- **Deploy / infra:** present — `wrangler.jsonc` with `observability: { enabled: true }` and `nodejs_compat`; CI runs lint + build; `npm run deploy` script; husky pre-commit + `check-wrangler-secrets.mjs`; `context/deployment/runbook.md` exists. Per `infrastructure.md`, `tech-stack.md` records `deployment_target: cloudflare-pages` while `@astrojs/cloudflare` v13 dropped Pages — Workers is the only target. This is a deploy-time pre-flight item, not a roadmap slice.
- **Observability:** partial — Cloudflare platform observability enabled; no app-level logging, error tracking, or tracing libraries. `main_goal: market-feedback` + `top_blocker: time` keeps this out of v1 scope.

## Foundations

### F-01: Multi-tenant data schema with per-user isolation

- **Outcome:** (foundation) Postgres schema for prompts, analyses (with `parent_analysis_id` self-reference and a `company_id` nullable FK for dual-linking per FR-026), watched_companies, and user_settings is live with RLS policies enforcing per-user isolation across every table.
- **Change ID:** data-schema-and-rls
- **PRD refs:** Access Control §Isolation, NFRs §isolation guardrail, FR-020 (analysis immutability — enforced as schema-level constraints / triggers, not at the application layer)
- **Unlocks:** S-01 (analyses + prompts + user_settings), S-02 (parent_analysis_id traversal), S-03 (analyses indexes for filter dimensions), S-04 (prompts edit/delete), S-05 (watched_companies), S-06 (analyses.company_id), S-07 (analysis ↔ company back-link), S-08 (recent-by-user reads). Verification path: every downstream slice can rely on RLS for isolation rather than re-implementing per-route auth checks.
- **Prerequisites:** —
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Per-user encryption mechanism for API keys (pgsodium vs Worker-secret-derived AES vs other) — Owner: `/10x-plan` on F-02. Block: no (key column shape is independent of encryption choice).
- **Risk:** RLS is the single most expensive thing to retrofit — every slice depends on the multi-tenant invariant. Sequenced first because deferring it pushes "do isolation correctly" into per-route handlers, which the PRD guardrail explicitly says cannot be relied on. The mitigation is enabling RLS and writing per-operation, per-role policies for every table at creation time, not later.
- **Status:** ready

### F-02: Per-user API keys and AI provider client

- **Outcome:** (foundation) `user_settings.api_keys` stores per-provider keys encrypted at rest and never re-rendered to the client; a thin `runAiAnalysis(provider, model, prompt, context?)` server function streams from Anthropic and OpenAI and returns text + sources verbatim.
- **Change ID:** api-keys-and-ai-provider-client
- **PRD refs:** FR-028 (per-user keys, encrypted, never disclosed), FR-029 (default model from Settings), FR-030 (model variants registry), FR-032 (sources verbatim), Business Logic #2 (continue-analysis context composition contract)
- **Unlocks:** S-01 (run + save), S-02 (continue-analysis context composition lives in the client's `context?` param), S-06 (watchlist-injected prompt composition prepends a structured block before the prompt body sent to the same client). Blocking unknown reduced: model variants registry shape (file vs DB vs env-driven) is settled before any user-facing flow touches it.
- **Prerequisites:** F-01
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Per-user API-key encryption mechanism (pgsodium / Worker-secret-derived AES / other) — Owner: `/10x-plan` on F-02. Block: yes for this slice (must pick before storing keys).
  - AI model variants registry shape (file vs DB vs env-driven) — Owner: `/10x-plan` on F-02 / S-01. Block: no (S-01 can ship with a hardcoded list; F-02 picks the long-term shape).
  - Input validation library choice (CLAUDE.md: "propose rather than assume zod") — Owner: `/10x-plan` on F-02. Block: no (the AI client's input shape is small enough to live without a library on day one).
- **Risk:** Encryption-at-rest is irreversible once keys are stored — picking the mechanism wrong and migrating later is per-key key-rotation, not a schema migration. Sequenced before any user-facing flow that needs a key (S-01) so the choice is made deliberately, not retrofitted.
- **Status:** proposed

## Slices

### S-01: First analysis on a free-text "other" topic

- **Outcome:** A signed-in user saves an API key in Settings, creates a minimal prompt, runs an analysis with type=`other` and a free-text topic, sees the AI result + verbatim sources rendered, saves it, and reopens it read-only. Empty-state CTAs guide the user from Dashboard → Prompts → Settings → New analysis when any prerequisite is missing.
- **Change ID:** first-analysis-other-topic
- **PRD refs:** US-01, FR-006, FR-007, FR-010 (other branch only), FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-028, FR-029, FR-030, FR-032
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Input validation library — Owner: `/10x-plan` on S-01. Block: no.
- **Risk:** This slice puts every load-bearing PRD invariant in production at once — snapshot-on-save (Business Logic #1), guarded API-key handling (FR-028 + NFR), source-verbatim rendering (FR-032). Sequenced as the first user-visible slice because the wedge (S-02) cannot be tested until at least one analysis exists; S-01's job is to make that "first analysis" minimal and end-to-end, not feature-rich.
- **Status:** proposed

### S-02: Continue-analysis chain — NORTH STAR

- **Outcome:** From the detail view of a saved analysis, the user runs "Continue analysis", picks a different prompt and/or model than the original, and the new analysis is saved as a child linked to the parent via `parent_analysis_id`. The next AI request receives the parent analysis's full AI output verbatim as context, followed by the new prompt and the new input. Detail views render parent ↔ child linkage so the chain is traversable.
- **Change ID:** continue-analysis-chain
- **PRD refs:** FR-018, Business Logic #2 (verbatim parent output, no auto-summarization in v1)
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** This is the wedge — the trait that makes Investment Assistant not-ChatGPT. The risk is not implementation complexity (the FR is small); the risk is that verbatim parent-output context turns out to feel useless in real research and the differentiator does not actually hold. The roadmap surfaces this risk by making S-02 the validation milestone — `main_goal: market-feedback` is exactly the bias that says "find out fast".
- **Status:** proposed

### S-03: Filter and sort the analyses list

- **Outcome:** The Analyses page lets the user filter by date range, by analysis type (`other` / `company`), and by associated company; sort by date asc/desc.
- **Change ID:** filter-analyses-list
- **PRD refs:** FR-017
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Filtering becomes load-bearing once the user has ≥ ~20 analyses (Socratic note in PRD). Sequenced after S-01 (so the page exists) but parallel with the wedge so it doesn't block validation.
- **Status:** proposed

### S-04: Prompts management — edit and delete

- **Outcome:** From the Prompts page, the user can edit a prompt's name, description, and body, and delete a prompt. Edits apply to the next run only — prior analyses keep the prompt text they were originally run with (snapshot-on-save invariant from Business Logic #1).
- **Change ID:** prompts-management
- **PRD refs:** FR-008, FR-009
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** The retain-the-snapshot invariant is the load-bearing rule. F-01's schema constraint on analyses immutability is the structural mitigation; this slice's only job is to not break that.
- **Status:** proposed

### S-05: Watchlist CRUD

- **Outcome:** User can add a watched company (name, ticker, exchange/market optional, industry/sector, free-text user note), list watched companies on the Watchlist page, open a company's detail view, edit fields and the note, see all analyses tied to the company, and delete the company — analyses tied to the company are preserved.
- **Change ID:** watchlist-crud
- **PRD refs:** FR-021, FR-022, FR-023, FR-027
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-03, S-04, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Standard CRUD against an RLS-isolated table; the only product-level subtlety is the preserve-on-delete default (FR-027 Socratic resolution). This slice does NOT yet include "run an analysis from the company detail view" — that's S-06.
- **Status:** proposed

### S-06: Company-bound analysis (new + continue, with watchlist-injected prompt composition)

- **Outcome:** From the New-analysis screen with type=`company`, the user picks a watched company (or types a free-text ticker/name for an unwatched one — FR-014's carve-out). When the company is watched, the application transparently prepends a structured block (Company / Ticker / Exchange / Industry / User note) to the prompt body before sending it to the AI client. From the watched company's detail view, the user can run a saved prompt or continue an existing analysis of that company. Continued analyses are dual-linked: `parent_analysis_id` to the parent, `company_id` to the watched company.
- **Change ID:** company-bound-analysis
- **PRD refs:** FR-010 (company branch), FR-024, FR-025, FR-026, Business Logic #3 (watchlist injection)
- **Prerequisites:** S-02, S-05
- **Parallel with:** S-03, S-04, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** This is the second wedge prong — combines the chain (S-02) with the watchlist injection block (Business Logic #3) so the user experiences "research about a specific company over time" rather than "list of one-shot prompts". Sequenced after both S-02 and S-05 because dual-linking requires both.
- **Status:** proposed

### S-07: Promote a company from an analysis result

- **Outcome:** An "Add to watchlist" button on the analysis detail view opens the watchlist add-form (the same form built in S-05) with the originating analysis tracked as a back-link. The user types every field manually. When the originating analysis is type=`company` with a free-text subject (FR-014's free-text-unwatched carve-out), the form pre-fills `name` from that subject — that is the only structured signal the system has. On save, if the originating analysis was type=`company`, it is linked to the new company row so it appears under FR-023's "all analyses tied to that company" view.
- **Change ID:** promote-company-from-result
- **PRD refs:** FR-019
- **Prerequisites:** S-01, S-05
- **Parallel with:** S-02, S-03, S-04, S-06, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** The deliberate constraint is "no parsing of AI prose to extract structured company data". FR-019's word "manually" is load-bearing — the value is navigation convenience (no force-navigate to the Watchlist page mid-insight), not data extraction. Sequenced late because it is pure convenience over S-05's existing form, not a wedge slice.
- **Status:** proposed

### S-08: Dashboard recent

- **Outcome:** The Dashboard renders the user's most recent analyses and watched companies as a quick-nav surface, with empty-state CTAs when either list is empty.
- **Change ID:** dashboard-recent
- **PRD refs:** FR-031
- **Prerequisites:** S-01, S-05
- **Parallel with:** S-02, S-03, S-04, S-06, S-07, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Lightweight start-page; the only invariant is reads-by-user honor RLS automatically (free with F-01).
- **Status:** proposed

### S-09: Password reset

- **Outcome:** User can request a password reset link via email from the sign-in surface and set a new password via the emailed link. This slice also closes out the must-have auth FRs satisfied by the existing baseline (signup, email-verify, signin, signout) — they are referenced here because S-09 owns the auth-completeness stream and is the natural place for `/10x-plan` to verify the full auth surface against PRD before marking the stream done.
- **Change ID:** password-reset
- **PRD refs:** FR-001 (baseline-satisfied), FR-002 (baseline-satisfied), FR-003 (baseline-satisfied), FR-004 (baseline-satisfied), FR-005 (this slice)
- **Prerequisites:** —
- **Parallel with:** F-01, F-02, S-01, S-02, S-03, S-04, S-05, S-06, S-07, S-08
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Auth baseline is already present (`src/lib/supabase.ts`, `src/middleware.ts`, signin/signup/signout/confirm-email all live). Closing this `must-have` FR is mechanical Supabase-API plumbing — kept as its own slice rather than a foundation because the wedge does not depend on it.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                       | Suggested issue title                                                          | Ready for `/10x-plan` | Notes                              |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------ | --------------------- | ---------------------------------- |
| F-01       | data-schema-and-rls             | Schema + RLS for prompts, analyses, watched_companies, user_settings           | yes                   | Run `/10x-plan data-schema-and-rls` |
| F-02       | api-keys-and-ai-provider-client | Encrypted per-user API keys + Anthropic / OpenAI streaming client              | no                    | Waits on F-01                       |
| S-01       | first-analysis-other-topic      | First analysis end-to-end on a free-text "other" topic (US-01)                 | no                    | Waits on F-01, F-02                 |
| S-02       | continue-analysis-chain         | Continue-analysis with prompt/model swap — wedge milestone                     | no                    | NORTH STAR. Waits on S-01           |
| S-03       | filter-analyses-list            | Filter / sort the Analyses page by date, type, company                         | no                    | Waits on S-01                       |
| S-04       | prompts-management              | Edit and delete saved prompts (snapshot retained on prior analyses)            | no                    | Waits on S-01                       |
| S-05       | watchlist-crud                  | Watchlist CRUD — add / list / view / edit / delete with preserve-tied-analyses | no                    | Waits on F-01                       |
| S-06       | company-bound-analysis          | Company-bound new + continue analysis with watchlist-injected prompt block     | no                    | Waits on S-02, S-05                 |
| S-07       | promote-company-from-result     | "Add to watchlist" from analysis detail with manual entry + back-link          | no                    | Waits on S-01, S-05                 |
| S-08       | dashboard-recent                | Dashboard quick-nav for recent analyses + watched companies                    | no                    | Waits on S-01, S-05                 |
| S-09       | password-reset                  | Email-link password reset (FR-005)                                             | yes                   | Run `/10x-plan password-reset`      |

## Open Roadmap Questions

1. **Per-user API-key encryption mechanism.** Supabase pgsodium vs Worker-secret-derived AES vs other. Owner: `/10x-plan` on F-02. Block: F-02.
2. **AI model variants registry shape.** File vs DB vs env-driven. Owner: `/10x-plan` on F-02 / S-01. Block: roadmap-wide (no — S-01 can hardcode initially).
3. **Input validation library choice.** CLAUDE.md says "propose rather than assume zod". Owner: `/10x-plan` on the first slice that introduces non-trivial input shapes (likely S-01). Block: no.
4. **`tech-stack.md` ↔ `infrastructure.md` deploy-target drift.** `tech-stack.md` records `deployment_target: cloudflare-pages` while `@astrojs/cloudflare` v13 dropped Pages. Reconcile `tech-stack.md` to `cloudflare-workers` before `/10x-implement` runs. Owner: user. Block: roadmap-wide (no — runbook + `wrangler.jsonc` already correct).

## Parked

- **No investment recommendations or advice** — Why parked: PRD §Non-Goals; the product never frames AI output as buy/sell/hold.
- **No sharing between users** — Why parked: PRD §Non-Goals; full per-user isolation, no public prompts, no team workspaces.
- **No market-data integration** — Why parked: PRD §Non-Goals; v1 has no real-time prices, fundamentals DBs, or news APIs.
- **No portfolio tracking** — Why parked: PRD §Non-Goals; watchlist is research-shaped, not position-shaped — no holdings, P&L, allocations.
- **No alerts or notifications** — Why parked: PRD §Non-Goals; v1 is pull-only.
- **No AI providers beyond Anthropic + OpenAI in v1** — Why parked: PRD §Non-Goals + `shape-notes.md` `## Forward: tech-stack`.
- **No offline operation** — Why parked: PRD §Non-Goals; v1 requires network access to read or run analyses.
- **FR-033 cost / token-usage display** — Why parked: PRD `nice-to-have`, not on the must-have path. Will revisit after the wedge ships.
- **Continue-analysis auto-summarization at 10× scale** — Why parked: PRD §Open Questions item 4 explicitly defers to v2 planning.
- **App-level observability (Sentry / structured logging / OTEL)** — Why parked: `top_blocker: time` plus baseline already has Cloudflare platform observability + `wrangler tail`. Revisit if the wedge ships and incident-response surfaces a real gap.

## Done

(Empty on first generation. `/10x-archive` appends an entry here when a change whose `Change ID` matches a roadmap item is archived.)
