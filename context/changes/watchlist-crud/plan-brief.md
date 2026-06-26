# Watchlist CRUD — Plan Brief

> Full plan: `context/changes/watchlist-crud/plan.md`

## What & Why

Let a user track companies they care about: add, list, edit, and delete watched companies, and see which company an analysis is tied to. This is the S-05 wedge prong — the watchlist is the filing backbone the later company-bound-analysis (S-06) and link-from-analysis (S-07) slices build on.

## Starting Point

The data layer is already done: the `watched_companies` table, its per-user RLS, and the `analyses.company_id … ON DELETE SET NULL` foreign key (which preserves tied analyses on delete) all exist in `supabase/migrations/20260529120000_data_schema_and_rls.sql`. Types are already exported in `src/types.ts`. There is currently no UI, no API routes, and no nav entry for the watchlist. The `prompts` feature is the CRUD pattern to clone.

## Desired End State

A signed-in user opens **/watchlist**, sees their companies (ordered by name), and adds one via a form (name required; ticker/exchange/industry/note optional). **/watchlist/[id]/edit** edits or deletes a company — delete warns how many analyses will be unlinked but preserved. On **/analyses** and **/analyses/[id]**, any analysis tied to a company shows that company's name as plain text.

## Key Decisions Made

| Decision                              | Choice                                                           | Why (1 sentence)                                                  | Source |
| ------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| Page structure                        | `/watchlist` + `/watchlist/[id]/edit` only                       | MVP — drop the dedicated company detail page                      | Plan   |
| Where the company↔analysis link shows | On the analysis (tree + detail), not on a company page           | `company_id` lives on the analysis; surfacing it there is simpler | Plan   |
| Company label on analyses             | Plain text, not clickable                                        | No read-only company route exists to link to                      | Plan   |
| Constraint handling                   | Validate in API; map Postgres `23505`/`23514` to friendly errors | Avoids raw DB 500s on duplicate-ticker / both-or-neither          | Plan   |
| Form fields                           | `name` required; ticker/exchange/industry/note optional          | Matches the schema and FR-021                                     | Plan   |
| Delete UX                             | Inline confirm **+ warn** about N unlinked analyses              | Transparent about the `SET NULL` side effect                      | Plan   |

## Scope

**In scope:**

- `/watchlist` list + create form
- `/watchlist/[id]/edit` edit + delete (with tied-analyses count warning)
- `api/watchlist/index.ts` (create) and `api/watchlist/[id].ts` (update/delete)
- Nav link + `PROTECTED_ROUTES` entry
- Company name surfaced on `/analyses` tree and `/analyses/[id]` detail

**Out of scope:**

- Company picker + Topic auto-populate on new-analysis (S-06)
- "Add to watchlist" / "Link to watched company" on analysis detail (S-07)
- Dedicated company detail page / company-side tied-analyses list (FR-023 from the company direction)
- Sort / filter / search on the list
- Any DB migration (schema already complete)

## Architecture / Approach

Clone the `prompts` CRUD surface for `watched_companies`: server-rendered Astro pages with form-POST API routes that redirect with `?ok`/`?error`, Origin CSRF check, null-client handling, and double-checked ownership (`.eq("user_id", user.id)`). Two watchlist-specific wrinkles: API-level validation of the `ticker_exchange_together` CHECK and a `count` query feeding the delete warning. Phase 2 widens the existing analyses list/detail queries to join the company name (`buildAnalysisForest` already spreads row fields, so a single added select column flows through to the tree node).

## Phases at a Glance

| Phase                  | What it delivers                                      | Key risk                                                            |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| 1. Watchlist CRUD      | list / create / edit / delete + nav + protected route | Postgres error-code mapping (`23505`/`23514`) for friendly messages |
| 2. Company on analyses | company name on `/analyses` tree + detail             | Embedded-join select shape on the analyses query                    |

**Prerequisites:** F-01 (auth + data schema) — already in place.
**Estimated effort:** ~1 session across 2 phases; Phase 1 is the bulk.

## Open Risks & Assumptions

- No UI yet exists to set `company_id` on an analysis (that's S-06/S-07), so Phase 2 manual testing requires setting `company_id` via Studio/SQL on a test analysis.
- FR-023 is satisfied only from the analysis side this slice; the company→analyses view is deferred.
- New date formatting must use `"pl-PL"` per `lessons.md`; existing `en-GB` calls are left untouched (out of scope).

## Success Criteria (Summary)

- A user can add, list, edit, and delete watched companies, with friendly errors for the both-or-neither and duplicate-ticker cases.
- Deleting a company preserves its tied analyses (confirmed end-to-end), and the user is warned of the count beforehand.
- An analysis tied to a company shows that company's name on the archive tree and detail page.
