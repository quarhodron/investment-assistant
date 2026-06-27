# Company-bound Analysis — Plan Brief

> Full plan: `context/changes/company-bound-analysis/plan.md`

## What & Why

Let users optionally tie an analysis to a watched company. On the new-analysis screen they pick a company from a structured picker; the Topic field auto-populates with `name (ticker)` (editable) and the analysis is filed under that company via `company_id`. Continued analyses inherit that link frozen. This delivers the "what have I learned about Apple?" grouping without ever injecting company facts into the AI prompt (only Topic + prompt + additional context reach the model — Business Logic #3).

## Starting Point

The data layer and API are **already wired for `company_id`**: the column exists on `analyses` (nullable FK to `watched_companies`, `ON DELETE SET NULL`), `validateRunInput` parses it, and `run.ts:159` inserts it. What's missing is the front-end picker, continue-flow inheritance, and a backend ownership check — today any `company_id` is inserted unverified.

## Desired End State

A user with watched companies sees an optional picker on new-analysis; picking one auto-fills Topic and files the run under that company. Users with no companies see a hint, no picker. Continuing a linked analysis carries the same `company_id` (plus `parent_analysis_id`) with no way to change it. The backend persists a `company_id` only when it belongs to the requester, degrading to `null` (never a failed run) if the company is foreign or deleted.

## Key Decisions Made

| Decision                          | Choice                                    | Why                                                                  | Source |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- | ------ |
| Picker UI                         | Native `<select>`                         | Matches existing model/prompt selectors; no new dependency           | Plan   |
| Topic auto-populate               | Always overwrite on pick                  | Simplest; user accepts re-pick replaces a customized Topic           | Plan   |
| Ownership validation              | Verify `company_id` ownership in `run.ts` | Closes cross-user linking hole using the existing parent-fetch idiom | Plan   |
| Continue link                     | Inherit silently from parent, no re-check | Honors FR-026; parent row already RLS-verified                       | Plan   |
| Empty watchlist                   | Hide picker, show subtle hint             | No dead control; surfaces the watchlist feature                      | Plan   |
| Stale/foreign company at run time | Save analysis with `company_id = null`    | Never waste an AI run over filing metadata; no cross-user link       | Plan   |

## Scope

**In scope:**

- New-analysis picker + Topic auto-populate + send `company_id`
- Continue-analysis frozen inheritance of `company_id`
- `run.ts` company-ownership verification with graceful `null` fallback

**Out of scope:**

- AI prompt changes / watchlist injection (Business Logic #3 — none)
- Schema migration (column + index already exist)
- Re-pick or clear link on continue (FR-026)
- Link/promote from an existing analysis (that's S-07)
- Searchable combobox / new shadcn components

## Architecture / Approach

Backend-first across three phases: (1) harden `run.ts` so only an owned `company_id` is persisted; (2) add the picker to `new.astro` + `NewAnalysisForm.tsx`, reusing the `watchlist.astro` query and the form's native-`<select>` idiom; (3) thread the parent's `company_id` through `continue.astro` + `ContinueAnalysisForm.tsx`. The AI composition layer is untouched.

## Phases at a Glance

| Phase                   | What it delivers                                       | Key risk                                             |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| 1. Backend hardening    | Owned-only `company_id` persistence; `null` fallback   | Getting the new-vs-continue branch + fallback right  |
| 2. New-analysis picker  | Optional picker + Topic auto-populate + payload wiring | Auto-populate/edge behavior; empty-state render path |
| 3. Continue inheritance | Frozen `company_id` inheritance on continue (FR-026)   | Minimal — load one extra field, conditional payload  |

**Prerequisites:** S-02, S-05, S-10 — all done. No new infra or access needed.
**Estimated effort:** ~1 session across 3 phases (mostly front-end; backend is a small targeted change).

## Open Risks & Assumptions

- Assumes `parent.company_id` is trustworthy on continue (it is — RLS-scoped fetch), so it is not re-validated.
- Always-overwrite Topic means re-touching the picker discards a hand-customized Topic — accepted per decision.
- Picker has no type-to-filter; fine for v1 watchlist sizes, may need a combobox later if watchlists grow large.

## Success Criteria (Summary)

- Picking a company files the run under it and Topic auto-fills; the detail view shows the company name.
- Continuing a linked analysis preserves the same `company_id` plus a `parent_analysis_id`, with no picker.
- A foreign or deleted `company_id` never links cross-user and never fails the run — it saves as `null`.
