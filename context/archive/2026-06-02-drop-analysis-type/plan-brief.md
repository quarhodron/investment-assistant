# Drop Analysis Type — Plan Brief

> Full plan: `context/changes/drop-analysis-type/plan.md`

## What & Why

Remove the `analysis_type` column (`'other'` | `'company'`) from the `analyses` table and every callsite that reads or writes it. The 2026-06-01 reshape (commit `d3d5148`) decided that `company_id IS NULL` vs `NOT NULL` is the sole discriminator between an unbound and a company-linked analysis, making the type enum redundant. This slice (S-10) performs the final structural cleanup so that S-03, S-06, and S-07 can be built against a schema that never had the column.

## Starting Point

The column is live in the current migration (`20260529120000_data_schema_and_rls.sql`) with an inline CHECK, a named cross-column constraint (`analyses_type_company_check`), and a standalone index (`analyses_user_type_created_idx`). All application layers reference it: validation, API handler, two React forms, and three Astro pages.

## Desired End State

The `analyses` table has no `analysis_type` column, no `analyses_type_company_check` constraint, and no `analyses_user_type_created_idx` index. All TypeScript compiles clean. The UI shows no type badge anywhere. `company_id` is the only discriminator the codebase uses.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| DB types update strategy | Regenerate via `npx supabase gen types` | Canonical source of truth; avoids hand-editing a generated file |
| Existing rows with `type=company, company_id=NULL` | Acceptable — no migration needed | Pre-production data; the column is informational and `company_id` is already the forward discriminator |
| Type badge replacement | Remove entirely | Company context display belongs to S-06; this slice keeps strictly to deletion |
| Company context in continue form | Strict removal only | Any company display in the continue flow is S-06 scope |

## Scope

**In scope:**
- SQL migration: drop `analyses_type_company_check` constraint, `analyses_user_type_created_idx` index, and `analysis_type` column
- Regenerate `src/db/database.types.ts`
- Remove `analysis_type` from validation (`src/lib/validation.ts`), API handler (`src/pages/api/ai/run.ts`), both React forms, and three Astro pages

**Out of scope:**
- Data backfill or row migration
- Any `company_id`-based badge, filter, or display logic (S-03/S-06/S-07)
- Company context in the continue form (S-06)

## Architecture / Approach

Sequential two-phase approach: schema first, application code second. Applying the migration before touching app code lets TypeScript errors (produced after types regeneration) be the definitive guide to every remaining callsite. No new logic is introduced — this is a deletion-only change across ~9 locations.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema Migration & Type Regeneration | Migration applied, `database.types.ts` regenerated, compiler flags stale callsites | Requires Docker + local Supabase to run `gen types` |
| 2. Application Code Cleanup | All `analysis_type` references removed, lint + build passing, UI verified | Missing a callsite that compiles but is silently wrong |

**Prerequisites:** S-02 must be shipped (analyses with `analysis_type` values exist in the DB). Docker must be available to run `npx supabase start` for type regeneration.

**Estimated effort:** ~1 session across 2 phases

## Open Risks & Assumptions

- `npx supabase gen types` requires Docker running locally — if Docker is unavailable, the implementer must hand-edit `database.types.ts` instead (three `analysis_type` fields removed from Row, Insert, and Update shapes).
- Phase 2 relies on the TypeScript compiler to surface all stale callsites after type regeneration — if any callsite bypasses the type system (e.g., a string cast), it will not be caught automatically and must be found by the `grep` check.

## Success Criteria (Summary)

- `grep -r 'analysis_type' src/` returns nothing
- `npm run build` and `npx astro check` pass clean
- UI: no type badge on list or detail pages; continue form has no type dropdown; new analyses can be created and saved end-to-end
