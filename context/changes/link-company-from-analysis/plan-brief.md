# Link company from analysis (S-07) — Plan Brief

> Full plan: `context/changes/link-company-from-analysis/plan.md`

## What & Why

Give the user two ways to file an analysis under a watched company directly from the analysis detail view: **Add to watchlist** (create a new company and back-link this analysis) and **Link to watched company** (set/change/clear `company_id` against an existing company). The conversion moment — "I found a company in this analysis, I want to track it / file this under it" — is where the friction should be removed (FR-019, FR-019b, FR-020).

## Starting Point

The detail view (`src/pages/analyses/[id]/index.astro`) is pure SSR and already shows a linked company's name, but offers **no way to set, change, or clear** the link. `company_id` is only writable at analysis-creation time via `POST /api/ai/run`; no update route exists. The schema is already ready — `company_id` is nullable, FK-constrained, freely mutable (the old gating constraint was dropped in S-10), and the `analyses_update` RLS policy is in place.

## Desired End State

On any analysis, two distinct buttons open the app's first shadcn dialog. "Add to watchlist" creates a company from manually typed fields and files the analysis under it. "Link to watched company" offers a picker (set/change) plus an explicit "Unlink" (clear). The masthead reflects the linked company after each action, and ownership is enforced so a user can never link to another user's company.

## Key Decisions Made

| Decision                  | Choice                                                              | Why                                                                  | Source |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| Interaction model         | shadcn `Dialog` (first in codebase)                                 | User chose modal UX over inline forms/sub-pages                      | Plan   |
| Add-to-watchlist wiring   | Reuse `POST /api/watchlist` + add JSON mode; link via separate call | Reuses existing create + validation; island needs the new id back    | Plan   |
| Link endpoint             | `PATCH /api/analyses/[id]` `{company_id\|null}`                     | One route serves set/change/clear; REST-correct; JSON for the island | Plan   |
| Clearing a link           | Explicit "Unlink" control alongside the picker                      | Matches FR-019b (set/change/clear) unambiguously                     | Plan   |
| Duplicate company (23505) | Surface error → "use Link instead"                                  | Honors FR-019 (no silent mutation); reuses existing 23505 handling   | Plan   |
| Testing                   | Vitest on new endpoints + manual UI                                 | Guards risky server logic; matches S-12 harness; no E2E wired here   | Plan   |

## Scope

**In scope:** `PATCH /api/analyses/[id]` link/unlink route; JSON mode on `POST /api/watchlist`; shadcn Dialog; a `LinkCompanyControls` island on the detail view; Vitest coverage of the new server logic.

**Out of scope:** schema migration; any AI/prompt involvement; changing continue-analysis link inheritance; editing an existing company's fields from this view; bulk filing; Playwright E2E; auto-linking on duplicate.

## Architecture / Approach

Backend first: one mutation route (`PATCH /api/analyses/[id]`) backs all link/change/clear operations; `POST /api/watchlist` gains a content-negotiated JSON branch so the Add dialog gets the new company `id`. Then the UI: install Dialog, build one React island hosting both flows, mount it on the SSR detail view with the company list + current link as props. The Add flow is two client requests (create → link); a partial failure (company created, link not set) is self-healing via the Link flow. Success reloads the page so the SSR masthead re-renders.

## Phases at a Glance

| Phase          | What it delivers                                                           | Key risk                                                            |
| -------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Backend     | `PATCH` link/unlink route + watchlist JSON mode + Vitest                   | First analyses-mutation route — ownership/RLS must be exact         |
| 2. UI          | shadcn Dialog + `LinkCompanyControls` island                               | First modal in the app (focus trap / a11y); two-write orchestration |
| 3. Integration | Mount island on detail view, props, empty/error states, visual distinction | "Add" vs "Link" must not be confusable (roadmap UX risk)            |

**Prerequisites:** S-01, S-05, S-10 — all shipped. No blockers.
**Estimated effort:** ~2–3 focused sessions across the 3 phases.

## Open Risks & Assumptions

- Two-write Add flow has no DB transaction; partial state (company created, not linked) is possible but recoverable via Link — the dialog must say so.
- Introducing the first Dialog adds an a11y surface (focus trap, Escape) not previously exercised in this codebase.
- Assumes the SSR-reload refresh is acceptable UX (no optimistic in-place update).

## Success Criteria (Summary)

- From a null-linked analysis, "Add to watchlist" creates a company and back-links it; the masthead shows it after reload.
- "Link" sets, changes, and unlinks `company_id`; a user can never link to a company they don't own.
- A duplicate company on "Add" is rejected with a clear pointer to "Link"; existing watchlist add-form and continue flow are unregressed.
