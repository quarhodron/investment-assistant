---
project: Investment Assistant
version: 1
status: draft
created: 2026-05-26
updated: 2026-06-27
prd_version: 1
main_goal: market-feedback
top_blocker: time
reshape_log:
  - date: 2026-06-01
    summary: "Removed analysis type axis. Added S-10 (drop-analysis-type cleanup), expanded S-07 to cover FR-019b (link-existing-company), rewrote S-06 (no type branching, no watchlist injection block). PRD v1 updated in place; shape-notes.md carries the reshape narrative."
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

| ID   | Change ID                       | Outcome (user can …)                                                                                                                                                      | Prerequisites    | PRD refs                                                                                                              | Status   |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| F-01 | data-schema-and-rls             | (foundation) per-user isolated schema for prompts, analyses, watched companies, settings live                                                                             | —                | Access Control §Isolation, NFRs §isolation, FR-020                                                                    | done     |
| F-02 | api-keys-and-ai-provider-client | (foundation) per-user API keys stored encrypted; thin AI client streams Anthropic / OpenAI                                                                                | F-01             | FR-028, FR-032, Business Logic #2                                                                                     | done     |
| S-01 | first-analysis-other-topic      | run their first analysis on a free-text "other" topic and reopen the saved result                                                                                         | F-01, F-02       | US-01, FR-006, FR-007, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-028, FR-029, FR-030, FR-032 | done     |
| S-02 | continue-analysis-chain         | continue a saved analysis with a different prompt and/or model, with the chain preserved                                                                                  | S-01             | FR-018, Business Logic #2                                                                                             | done     |
| S-10 | drop-analysis-type              | (cleanup) `type` column gone from schema, API, and UI — `company_id` is the sole discriminator                                                                            | S-02             | FR-010 (post-2026-06-01 reshape), FR-014                                                                              | done     |
| S-04 | prompts-management              | edit and delete saved prompts; prior analyses retain their snapshot                                                                                                       | S-01             | FR-008, FR-009                                                                                                        | done     |
| S-05 | watchlist-crud                  | add, list, view, edit, and delete watched companies; deletes preserve tied analyses                                                                                       | F-01             | FR-021, FR-022, FR-023, FR-027                                                                                        | done     |
| S-06 | company-bound-analysis          | pick a watched company on new-analysis (Topic auto-populates `name (ticker)`, editable); continue inherits the company link unchanged                                     | S-02, S-05, S-10 | FR-010 (picker), FR-026, Business Logic #3                                                                            | done     |
| S-07 | link-company-from-analysis      | promote a new company from an analysis (FR-019) AND link an analysis to an existing watched company (FR-019b); both flows back-link / file the analysis under the company | S-01, S-05, S-10 | FR-019, FR-019b, FR-020 (filing carve-out)                                                                            | proposed |
| S-08 | dashboard-recent                | see recent analyses and watched companies on the Dashboard as a quick-nav surface                                                                                         | S-01, S-05       | FR-031                                                                                                                | proposed |
| S-09 | password-reset                  | request a password reset link via email and set a new password                                                                                                            | —                | FR-001, FR-002, FR-003, FR-004, FR-005                                                                                | ready    |
| S-11 | analyses-tree-view              | (ad-hoc) see continue-analysis chains on the `/analyses` index as collapsible chain-root groups instead of a flat list                                                    | S-02             | FR-018 (chain visibility at list level)                                                                               | done     |
| S-12 | testing-runner-and-ai-run-path  | (ad-hoc) Vitest harness + first integration tests for the AI run path; split three colliding `service_unavailable` codes into distinct ones                               | S-01, S-02       | NFRs §testability, test-plan.md §3 (Phase 1)                                                                          | done     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                        | Chain                             | Note                                                                                                                                                                                                                                                            |
| ------ | ---------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Wedge (validation milestone) | `F-01` → `F-02` → `S-01` → `S-02` | Path to the north star. `main_goal: market-feedback` means everything else waits on this.                                                                                                                                                                       |
| A'     | Reshape cleanup              | `S-10`                            | Drops `type` from schema/API/UI after the 2026-06-01 reshape. Joins Stream A at `S-02`; gates `S-06` and `S-07` so they don't re-introduce the dropped column.                                                                                                  |
| B      | Workspace navigation         | `S-04` → `S-08`                   | Read-side polish; sequenced after the wedge + S-10 ship. Joins Stream A at `S-01`.                                                                                                                                                                              |
| C      | Company-bound research       | `S-05` → `S-06` → `S-07`          | Second wedge prong. With the 2026-06-01 reshape, the wedge is "watched-company link + Topic auto-populate" rather than "watchlist injection". `S-06` joins Stream A at `S-02` and Stream A' at `S-10`; `S-07` joins Stream A at `S-01` and Stream A' at `S-10`. |
| D      | Auth completeness            | `S-09`                            | Closes the FR-005 gap; can ship anytime — no foundation prerequisite.                                                                                                                                                                                           |

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
- **PRD refs:** Access Control §Isolation, NFRs §isolation guardrail, FR-020 (watched-company link mutability carve-out)
- **Unlocks:** S-01 (analyses + prompts + user_settings), S-02 (parent_analysis_id traversal), S-04 (prompts edit/delete), S-05 (watched_companies), S-06 (analyses.company_id), S-07 (analysis ↔ company back-link), S-08 (recent-by-user reads). Verification path: every downstream slice can rely on RLS for isolation rather than re-implementing per-route auth checks.
- **Prerequisites:** —
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Per-user encryption mechanism for API keys (pgsodium vs Worker-secret-derived AES vs other) — Owner: `/10x-plan` on F-02. Block: no (key column shape is independent of encryption choice).
- **Risk:** RLS is the single most expensive thing to retrofit — every slice depends on the multi-tenant invariant. Sequenced first because deferring it pushes "do isolation correctly" into per-route handlers, which the PRD guardrail explicitly says cannot be relied on. The mitigation is enabling RLS and writing per-operation, per-role policies for every table at creation time, not later.
- **Status:** done

### F-02: Per-user API keys and AI provider client

- **Outcome:** (foundation) `user_settings.api_keys` stores per-provider keys encrypted at rest and never re-rendered to the client; a thin `runAiAnalysis(provider, model, prompt, context?)` server function streams from Anthropic and OpenAI and returns text + sources verbatim.
- **Change ID:** api-keys-and-ai-provider-client
- **PRD refs:** FR-028 (per-user keys, encrypted, never disclosed), FR-029 (default model from Settings), FR-030 (model variants registry), FR-032 (sources verbatim), Business Logic #2 (continue-analysis context composition contract)
- **Unlocks:** S-01 (run + save), S-02 (continue-analysis context composition lives in the client's `context?` param), S-06 (company-bound analysis sends only the user's prompt + Topic + additional context — Business Logic #3 as revised 2026-06-01 means no application-side injection block). Blocking unknown reduced: model variants registry shape (file vs DB vs env-driven) is settled before any user-facing flow touches it.
- **Prerequisites:** F-01
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Per-user API-key encryption mechanism (pgsodium / Worker-secret-derived AES / other) — Owner: `/10x-plan` on F-02. Block: yes for this slice (must pick before storing keys).
  - AI model variants registry shape (file vs DB vs env-driven) — Owner: `/10x-plan` on F-02 / S-01. Block: no (S-01 can ship with a hardcoded list; F-02 picks the long-term shape).
  - Input validation library choice (CLAUDE.md: "propose rather than assume zod") — Owner: `/10x-plan` on F-02. Block: no (the AI client's input shape is small enough to live without a library on day one).
- **Risk:** Encryption-at-rest is irreversible once keys are stored — picking the mechanism wrong and migrating later is per-key key-rotation, not a schema migration. Sequenced before any user-facing flow that needs a key (S-01) so the choice is made deliberately, not retrofitted.
- **Status:** done

## Slices

### S-01: First analysis on a free-text "other" topic

- **Outcome:** A signed-in user saves an API key in Settings, creates a minimal prompt, runs an analysis with type=`other` and a free-text topic, sees the AI result + verbatim sources rendered, saves it, and reopens it read-only. Empty-state CTAs guide the user from Dashboard → Prompts → Settings → New analysis when any prerequisite is missing.
- **Note (post-2026-06-01 reshape):** S-01 shipped with the original `type` axis. S-10 retroactively drops the column from schema, API, and UI; existing S-01-era analyses continue to work with `company_id IS NULL` after the migration. The Outcome above is preserved verbatim as historical record.
- **Change ID:** first-analysis-other-topic
- **PRD refs:** US-01, FR-006, FR-007, FR-010 (other branch only), FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-028, FR-029, FR-030, FR-032
- **Prerequisites:** F-01, F-02
- **Parallel with:** S-09
- **Blockers:** —
- **Unknowns:**
  - Input validation library — Owner: `/10x-plan` on S-01. Block: no.
- **Risk:** This slice puts every load-bearing PRD invariant in production at once — snapshot-on-save (Business Logic #1), guarded API-key handling (FR-028 + NFR), source-verbatim rendering (FR-032). Sequenced as the first user-visible slice because the wedge (S-02) cannot be tested until at least one analysis exists; S-01's job is to make that "first analysis" minimal and end-to-end, not feature-rich.
- **Status:** done

### S-02: Continue-analysis chain — NORTH STAR

- **Outcome:** From the detail view of a saved analysis, the user runs "Continue analysis", picks a different prompt and/or model than the original, and the new analysis is saved as a child linked to the parent via `parent_analysis_id`. The next AI request receives the parent analysis's full AI output verbatim as context, followed by the new prompt and the new input. Detail views render parent ↔ child linkage so the chain is traversable.
- **Change ID:** continue-analysis-chain
- **PRD refs:** FR-018, Business Logic #2 (verbatim parent output, no auto-summarization in v1)
- **Prerequisites:** S-01
- **Parallel with:** S-04, S-05, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** This is the wedge — the trait that makes Investment Assistant not-ChatGPT. The risk is not implementation complexity (the FR is small); the risk is that verbatim parent-output context turns out to feel useless in real research and the differentiator does not actually hold. The roadmap surfaces this risk by making S-02 the validation milestone — `main_goal: market-feedback` is exactly the bias that says "find out fast".
- **Status:** done

### S-04: Prompts management — edit and delete

- **Outcome:** From the Prompts page, the user can edit a prompt's name, description, and body, and delete a prompt. Edits apply to the next run only — prior analyses keep the prompt text they were originally run with (snapshot-on-save invariant from Business Logic #1).
- **Change ID:** prompts-management
- **PRD refs:** FR-008, FR-009
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-05, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** The retain-the-snapshot invariant is the load-bearing rule — prior analyses must keep the prompt text they were run with. This slice's only job is to not break that.
- **Status:** done

### S-05: Watchlist CRUD

- **Outcome:** User can add a watched company (name, ticker, exchange/market optional, industry/sector, free-text user note), list watched companies on the Watchlist page, open a company's detail view, edit fields and the note, see all analyses tied to the company, and delete the company — analyses tied to the company are preserved.
- **Change ID:** watchlist-crud
- **PRD refs:** FR-021, FR-022, FR-023, FR-027
- **Prerequisites:** F-01
- **Parallel with:** S-02, S-04, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Standard CRUD against an RLS-isolated table; the only product-level subtlety is the preserve-on-delete default (FR-027 Socratic resolution). This slice does NOT yet include "run an analysis from the company detail view" — that's S-06.
- **Status:** done

### S-06: Company-bound analysis (picker + Topic auto-populate + continue inheritance)

- **Outcome:** The new-analysis screen exposes an optional watched-company picker. When the user picks a watched company, the Topic field auto-populates with `name (ticker)` and remains editable; the resulting analysis is linked via `company_id`. Continued analyses dual-link: `parent_analysis_id` to the parent and `company_id` inherited from the parent unchanged (no re-pick or unset on continue). Only the user's prompt + Topic + additional context reach the AI — no watchlist-injection block (Business Logic #3 as revised 2026-06-01).
- **Change ID:** company-bound-analysis
- **PRD refs:** FR-010 (picker + Topic auto-populate), FR-026 (company-link freeze on continue), Business Logic #3 (Topic-only AI input)
- **Prerequisites:** S-02, S-05, S-10
- **Parallel with:** S-04, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** The reshape moved this slice's center of gravity from "transparent injection of structured company facts into the prompt" to "predictable Topic-driven prompt + filing via `company_id`". The mitigation for losing injection is the editable Topic — the user can paste any company facts they want into Topic / additional context if a particular run benefits. If real use shows users routinely re-typing industry / exchange into Topic, that's a signal Business Logic #3 should be revisited (post-v1).
- **Status:** done

### S-07: Link an analysis to a watched company (promote-new + link-existing)

- **Outcome:** Two affordances on the analysis detail view: (1) "Add to watchlist" — opens the S-05 watchlist add-form with the originating analysis tracked as a back-link; on save the new watchlist row is created and the originating analysis is filed under it (`company_id` set). (2) "Link to watched company" — opens a picker of the user's existing watched companies; on confirm the analysis's `company_id` is set to the chosen row. Both flows are available on every analysis whose `company_id` is currently null; "Link to watched company" can also clear an existing link back to null. The user types every watchlist field manually in flow (1) — no AI-prose parsing.
- **Change ID:** link-company-from-analysis
- **PRD refs:** FR-019, FR-019b, FR-020 (filing carve-out — `company_id` is the one mutable field)
- **Prerequisites:** S-01, S-05, S-10
- **Parallel with:** S-04, S-06, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** With the type axis removed, both flows are available on every analysis (not just type=`company`) — that's the intent. The watchlist-add path stays "user types every field manually" (FR-019); the link-existing path is a picker only. The risk is mostly UX clarity — "Add to watchlist" and "Link to watched company" must be visually distinct so the user does not pick "Link" intending to create a new row. Sequenced late because it is convenience over S-05's existing form + FR-019b is a small affordance over the existing detail view.
- **Status:** proposed

### S-08: Dashboard recent

- **Outcome:** The Dashboard renders the user's most recent analyses and watched companies as a quick-nav surface, with empty-state CTAs when either list is empty.
- **Change ID:** dashboard-recent
- **PRD refs:** FR-031
- **Prerequisites:** S-01, S-05
- **Parallel with:** S-02, S-04, S-06, S-07, S-09
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
- **Parallel with:** F-01, F-02, S-01, S-02, S-04, S-05, S-06, S-07, S-08, S-10
- **Blockers:** —
- **Unknowns:**
  - —
- **Risk:** Auth baseline is already present (`src/lib/supabase.ts`, `src/middleware.ts`, signin/signup/signout/confirm-email all live). Closing this `must-have` FR is mechanical Supabase-API plumbing — kept as its own slice rather than a foundation because the wedge does not depend on it.
- **Status:** ready

### S-10: Drop analysis `type` (post-reshape cleanup)

- **Outcome:** The `type` column is removed from the `analyses` table (migration), from the API response and request shapes, and from every UI surface (new-analysis form, analysis detail view, analysis list rows). `company_id` becomes the sole discriminator between "tied to a watched company" and "not". Analyses created during S-01 / S-02 with `type=other` continue to work unchanged — they simply have `company_id IS NULL`. No data loss.
- **Change ID:** drop-analysis-type
- **PRD refs:** FR-010 (post-2026-06-01 reshape — picker, no toggle), FR-014 (no `type` in saved analysis)
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-09
- **Blockers:** S-06, S-07 (sequenced after S-10 to avoid coding against a column being removed)
- **Unknowns:**
  - —
- **Risk:** Forward migration on a live schema column. Mitigations: (1) S-02 is the latest shipped slice, so the migration runs against a known set of analyses; (2) the column is informational (the discriminator the application relies on going forward is `company_id`); (3) drop is preceded by code paths stopping reads of `type` so the migration is a final structural cleanup, not a flag flip. This slice is the one place the reshape touches the existing schema — kept small and self-contained so the slices that ship after it can assume `type` is gone.
- **Status:** done

### S-11: Analyses tree view (ad-hoc — retro-recorded)

- **Outcome:** The `/analyses` index renders the user's analyses as a forest of chain-roots instead of a flat `created_at`-sorted list. Each root carries a `· N steps` badge and a chevron when it has descendants; expanding a root shows the continue-analysis chain inline, indented in build order, via native `<details>`/`<summary>` (no client JS, no island). Roots sort by latest-activity-in-chain; singletons render as plain rows. Backend untouched — `parent_analysis_id` already existed.
- **Change ID:** analyses-tree-view
- **PRD refs:** FR-018 (makes the continue-analysis chain — the S-02 wedge — legible at the list level)
- **Prerequisites:** S-02
- **Parallel with:** S-04, S-06, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Provenance:** Not part of the original PRD-derived roadmap — an ad-hoc change conceived and shipped 2026-06-04 to make the wedge visible at the list level. Retro-recorded here on 2026-06-27 during an archive ↔ roadmap reconciliation so the roadmap reflects all shipped work. Archived at `context/archive/2026-06-04-analyses-tree-view/`.
- **Risk:** Pure read-side rendering over an existing data model — the only correctness traps were computing the subtree sort key bottom-up after linking, and keeping the title `<a>` and the chevron toggle un-nested (valid HTML). No schema, API, or index work.
- **Status:** done

### S-12: Test runner + critical AI run path (ad-hoc — retro-recorded)

- **Outcome:** Vitest is installed with a bare-Node harness (`npm test` / `npm run test:watch`) and the first integration tests cover `POST /api/ai/run` against the three highest-impact wedge risks: SSE persistence atomicity (no half-saved row on error), continue-analysis context composition (parent output forwarded verbatim, parent prompt/input never leak), and error-class disambiguation. As part of this, the three colliding `service_unavailable` error codes were split into `supabase_unavailable`, `settings_unavailable`, and `models_unavailable` — a production change. This is Phase 1 of the four-phase rollout in `context/foundation/test-plan.md`.
- **Change ID:** testing-runner-and-ai-run-path
- **PRD refs:** NFRs §testability; `context/foundation/test-plan.md` §3 (Phase 1), §6.1, §6.2
- **Prerequisites:** S-01, S-02 (the AI run path and continue-analysis composition must exist to test)
- **Parallel with:** S-04, S-06, S-08, S-09
- **Blockers:** —
- **Unknowns:**
  - —
- **Provenance:** Not part of the original PRD-derived roadmap — an ad-hoc testing-infrastructure change conceived and shipped 2026-06-05 (archived 2026-06-12). Retro-recorded here on 2026-06-27 during an archive ↔ roadmap reconciliation. Archived at `context/archive/2026-06-05-testing-runner-and-ai-run-path/`. Phases 2–4 of the test-plan rollout remain unscheduled.
- **Risk:** The harness stubs Supabase, `runAiAnalysis`, and `decryptApiKey` at the module boundary, so Phase 1's "no row on error" is asserted as "insert never called" — real-DB validation is deferred to Phase 2. The `service_unavailable` split was the one production-facing edit; isolated to its own phase to keep the diff reviewable.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                           | Suggested issue title                                                              | Ready for `/10x-plan` | Notes                              |
| ---------- | ----------------------------------- | ---------------------------------------------------------------------------------- | --------------------- | ---------------------------------- |
| ~~F-01~~   | ~~data-schema-and-rls~~             | ~~Schema + RLS for prompts, analyses, watched_companies, user_settings~~           | —                     | ✅ shipped — archived              |
| ~~F-02~~   | ~~api-keys-and-ai-provider-client~~ | ~~Encrypted per-user API keys + Anthropic / OpenAI streaming client~~              | —                     | ✅ shipped — archived              |
| ~~S-01~~   | ~~first-analysis-other-topic~~      | ~~First analysis end-to-end on a free-text "other" topic (US-01)~~                 | —                     | ✅ shipped — archived              |
| ~~S-02~~   | ~~continue-analysis-chain~~         | ~~Continue-analysis with prompt/model swap — wedge milestone~~                     | —                     | ✅ shipped — archived (NORTH STAR) |
| ~~S-10~~   | ~~drop-analysis-type~~              | ~~Drop `type` from analyses schema, API, and UI (post-2026-06-01 reshape)~~        | —                     | ✅ shipped — archived              |
| ~~S-04~~   | ~~prompts-management~~              | ~~Edit and delete saved prompts (snapshot retained on prior analyses)~~            | —                     | ✅ shipped — archived              |
| ~~S-05~~   | ~~watchlist-crud~~                  | ~~Watchlist CRUD — add / list / view / edit / delete with preserve-tied-analyses~~ | —                     | ✅ shipped — archived              |
| ~~S-06~~   | ~~company-bound-analysis~~          | ~~Company-bound new + continue analysis (picker + Topic auto-populate)~~           | —                     | ✅ shipped — archived              |
| S-07       | link-company-from-analysis          | Promote-new (FR-019) + link-existing (FR-019b) from an analysis detail view        | no                    | Waits on S-01, S-05, S-10          |
| S-08       | dashboard-recent                    | Dashboard quick-nav for recent analyses + watched companies                        | no                    | Waits on S-01, S-05                |
| S-09       | password-reset                      | Email-link password reset (FR-005)                                                 | yes                   | Run `/10x-plan password-reset`     |

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
- **Watchlist-injected prompt composition (original Business Logic #3)** — Why parked: removed in the 2026-06-01 reshape in favor of "Topic-only AI input + auto-populate `name (ticker)`". Revisit only if real use shows users routinely re-typing industry / exchange / note into the Topic or additional context — i.e., if the watchlist row is genuinely carrying signal the user wants the AI to see. Until that signal exists, predictable Topic-driven prompts stay simpler than transparent injection.
- **App-level observability (Sentry / structured logging / OTEL)** — Why parked: `top_blocker: time` plus baseline already has Cloudflare platform observability + `wrangler tail`. Revisit if the wedge ships and incident-response surfaces a real gap.

## Done

- **F-01: (foundation) per-user isolated schema for prompts, analyses, watched companies, settings live** — Archived 2026-05-31 → `context/archive/2026-05-29-data-schema-and-rls/`. Lesson: —.
- **F-02: (foundation) per-user API keys stored encrypted; thin AI client streams Anthropic / OpenAI** — Archived 2026-05-31 → `context/archive/2026-05-30-api-keys-and-ai-provider-client/`. Lesson: —.
- **S-01: run their first analysis on a free-text "other" topic and reopen the saved result** — Archived 2026-05-31 → `context/archive/2026-05-31-first-analysis-other-topic/`. Lesson: —.
- **S-02: From the detail view of a saved analysis, the user runs "Continue analysis", picks a different prompt and/or model than the original, and the new analysis is saved as a child linked to the parent via `parent_analysis_id`. The next AI request receives the parent analysis's full AI output verbatim as context, followed by the new prompt and the new input. Detail views render parent ↔ child linkage so the chain is traversable.** — Archived 2026-06-01 → `context/archive/2026-05-31-continue-analysis-chain/`. Lesson: —.
- **S-10: The `type` column is removed from the `analyses` table (migration), from the API response and request shapes, and from every UI surface (new-analysis form, analysis detail view, analysis list rows). `company_id` becomes the sole discriminator between "tied to a watched company" and "not". Analyses created during S-01 / S-02 with `type=other` continue to work unchanged — they simply have `company_id IS NULL`. No data loss.** — Archived 2026-06-02 → `context/archive/2026-06-02-drop-analysis-type/`. Lesson: —.
- **S-04: From the Prompts page, the user can edit a prompt's name, description, and body, and delete a prompt. Edits apply to the next run only — prior analyses keep the prompt text they were originally run with (snapshot-on-save invariant from Business Logic #1).** — Archived 2026-06-12 → `context/archive/2026-06-02-prompts-management/`. Lesson: —.
- **S-05: add, list, view, edit, and delete watched companies; deletes preserve tied analyses** — Archived 2026-06-27 → `context/archive/2026-06-26-watchlist-crud/`. Lesson: —.
- **S-06: pick a watched company on new-analysis (Topic auto-populates `name (ticker)`, editable); continue inherits the company link unchanged** — Archived 2026-06-27 → `context/archive/2026-06-27-company-bound-analysis/`. Lesson: —.
- **S-11: (ad-hoc) see continue-analysis chains on the `/analyses` index as collapsible chain-root groups instead of a flat list** — Archived 2026-06-04 → `context/archive/2026-06-04-analyses-tree-view/`. Retro-recorded 2026-06-27 (off-roadmap when shipped). Lesson: —.
- **S-12: (ad-hoc) Vitest harness + first integration tests for the AI run path; split three colliding `service_unavailable` codes into distinct ones** — Archived 2026-06-12 → `context/archive/2026-06-05-testing-runner-and-ai-run-path/`. Retro-recorded 2026-06-27 (off-roadmap when shipped). Lesson: —.
