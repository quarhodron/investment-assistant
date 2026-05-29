<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Data Schema and RLS (F-01)

- **Plan**: context/changes/data-schema-and-rls/plan.md
- **Scope**: All 3 phases
- **Date**: 2026-05-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical · 3 warnings · 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — RLS smoke skips the cross-user INSERT spoof test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/rls_smoke.sql:131-179
- **Detail**: Script verifies user B's SELECT/UPDATE/DELETE return zero rows on user A's data, but never attempts an INSERT with `user_id = userA` while authenticated as user B. The WITH CHECK clause on every INSERT policy exists exactly to stop spoofed user_id writes — and this is the one assertion that would catch a regression where the INSERT WITH CHECK predicate is dropped or weakened.
- **Fix**: Add one `DO $$ … EXCEPTION WHEN check_violation … $$` block per table that, while authenticated as user B, attempts `INSERT INTO <table> (user_id, …) VALUES (userA_id, …)` and RAISES `'FAIL: spoofed insert allowed'` if the insert succeeds.
  - Strength: Closes the most attacker-relevant gap left in the harness; same SET LOCAL plumbing as existing assertions.
  - Tradeoff: ~30 lines of script.
  - Confidence: HIGH — same pattern as the existing assertion blocks.
  - Blind spot: None significant.
- **Decision**: FIXED — added per-table spoofed-INSERT assertion blocks (insufficient_privilege catch).

### F2 — rls_smoke coverage gaps vs. plan's "every table"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/tests/rls_smoke.sql:131-179
- **Detail**: Plan's Phase 3 contract: "As user B: …UPDATE returns zero rows affected; DELETE returns zero rows affected" on every table. Actual: UPDATE checks cover only `prompts` and `watched_companies`. DELETE checks cover only `prompts` and `analyses`. `user_settings` UPDATE is unchecked; `user_settings` and `watched_companies` DELETE are unchecked.
- **Fix**: Add the three missing assertion blocks, mirroring the existing shape (SELECT count(*); IF affected != 0 RAISE 'FAIL:…').
- **Decision**: FIXED — added user_settings UPDATE; watched_companies and user_settings DELETE assertions.

### F3 — user_settings has no auto-create or documented upsert path

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: supabase/migrations/20260529120000_data_schema_and_rls.sql:90-114
- **Detail**: The `user_settings` row is 1:1 with `auth.users` (PK = user_id) but there is no `AFTER INSERT ON auth.users` trigger to create it, and the plan does not document app-side upsert semantics. Two near-simultaneous requests after sign-up that each "check, then insert" will race on the PK and one returns 23505 unique_violation. F-02 will need this row first thing.
- **Fix A ⭐ Recommended**: Add a follow-up migration with an `AFTER INSERT ON auth.users` trigger that INSERTs into `user_settings` `ON CONFLICT DO NOTHING`.
  - Strength: Eliminates the race structurally. Every later slice can assume the row exists.
  - Tradeoff: Adds a trigger on auth.users — Supabase-allowed but a schema surface most apps don't touch.
  - Confidence: HIGH — common Supabase idiom; matches the row-1:1 model.
  - Blind spot: Existing dev users won't get back-filled — pair with a one-off back-fill `INSERT … SELECT … ON CONFLICT DO NOTHING`.
- **Fix B**: Document that all writes to `user_settings` MUST use `INSERT … ON CONFLICT (user_id) DO UPDATE`.
  - Strength: No schema change.
  - Tradeoff: Pushes the rule to every future caller; defeats the structural-enforcement theme of this slice.
  - Confidence: MEDIUM — works only as long as discipline holds.
  - Blind spot: First out-of-band write that forgets ON CONFLICT will hit prod before anyone notices.
- **Decision**: SKIPPED — defer to F-02 / future slice.

### F4 — Trigger functions lack SET search_path

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260529120000_data_schema_and_rls.sql:8-14, 149-155
- **Detail**: `set_updated_at()` and `analyses_immutable()` don't pin search_path. Supabase's `function_search_path_mutable` linter flags this. Functions are trivial and don't resolve unqualified identifiers, so exploitation surface is small — but the warning is noise and the hardening is one line each.
- **Fix**: Append `SET search_path = ''` to both function definitions.
- **Decision**: SKIPPED — low exploitation surface; trivial functions.

### F5 — No explicit GRANT to authenticated; relies on Supabase defaults

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20260529120000_data_schema_and_rls.sql:41,76,110,172
- **Detail**: Migration revokes from `anon` per table but never explicitly GRANTs to `authenticated`. Works today because Supabase ships instance-level defaults. The plan's NFR §isolation guardrail says route-layer auth cannot be relied on — by symmetry, table-level grants probably shouldn't rely on the Supabase instance's default ACLs either.
- **Fix**: Add `GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO authenticated` after each `ENABLE ROW LEVEL SECURITY` (analyses still gets UPDATE — RLS + immutability trigger handle rejection).
- **Decision**: FIXED — added explicit GRANTs on all four tables.

### F6 — Immutability error message omits "(FR-020)" suffix

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260529120000_data_schema_and_rls.sql:152
- **Detail**: Plan said the trigger raises `cannot_modify_immutable_analysis (FR-020)`. Actual raises just `cannot_modify_immutable_analysis`. The `FR-020` reference exists only as a comment on line 148. rls_smoke matches on a substring so functional impact is zero, but the message is what shows up in operator logs.
- **Fix**: Change line 152 to `RAISE EXCEPTION 'cannot_modify_immutable_analysis (FR-020)'`.
- **Decision**: SKIPPED — comment carries the FR pointer; no functional impact.

### F7 — Unplanned eslint.config.js ignore for src/db/**

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:86
- **Detail**: Plan didn't mention eslint config. Phase 2 generated `src/db/database.types.ts`, which trips strictTypeChecked rules. The `{ ignores: ["src/db/**"] }` block is the necessary lint escape hatch — directly caused by, and scoped to, Phase 2.
- **Fix**: Note the addition in the plan epilogue / change.md as an expected side effect of generated types. No code change.
- **Decision**: FIXED — added Implementation Notes (post-merge) section to plan.md documenting the ignore.

### F8 — analyses_update "belt-and-suspenders" comment understates the policy's role

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260529120000_data_schema_and_rls.sql:165
- **Detail**: The policy is NOT redundant. RLS USING evaluates before BEFORE UPDATE triggers fire. Without it, a future RLS loosening would leak the immutability error to attackers probing other users' analysis IDs (info-disclosure of "this id exists").
- **Fix**: Reword line 165 comment, e.g. "Required: keeps cross-user UPDATEs hidden by RLS instead of leaking immutability errors. Trigger handles same-user UPDATEs."
- **Decision**: FIXED — reworded comment to explain info-disclosure concern.

### F9 — Asymmetric analyses_type_company_check is intentional but uncommented

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260529120000_data_schema_and_rls.sql:142-143
- **Detail**: Constraint allows `analysis_type='company'` with `company_id=NULL`. Confirmed correct against FR-014 (free-text unwatched company) and FR-027 (preserved-on-company-delete via `ON DELETE SET NULL`). The line 141 comment only mentions FR-014; the FR-027 motivation is the more surprising one for a future reader.
- **Fix**: Expand the comment on line 141 to reference both FR-014 (intent on insert) and FR-027 (preserved-on-company-delete).
- **Decision**: FIXED — expanded comment to reference both FRs and the ON DELETE SET NULL path.
