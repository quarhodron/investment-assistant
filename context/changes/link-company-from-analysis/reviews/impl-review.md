<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Link company from analysis (S-07)

- **Plan**: context/changes/link-company-from-analysis/plan.md
- **Scope**: All Phases (1–3 of 3)
- **Date**: 2026-06-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — "Add to watchlist" button renamed to "Track new company"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/LinkCompanyControls.tsx (AddDialog trigger + title)
- **Detail**: The plan specifies the button label "Add to watchlist" in Phase 2 and 3. Implementation uses "Track new company" for both the trigger button and the dialog title. Commit fd86f34 was explicitly about updating dialog text — this appears to be a deliberate copy change.
- **Fix**: Accept "Track new company" and add a plan addendum documenting the copy decision; OR revert to "Add to watchlist" to match the plan verbatim.
- **Decision**: SKIPPED

### F2 — Both trigger buttons use identical ghost styling (no visual distinction)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/LinkCompanyControls.tsx (both trigger buttons)
- **Detail**: The plan (Phase 3) explicitly requires "The two buttons must be visually distinct so 'Link' is not mistaken for 'Add'". Both are rendered with the same `ghostBtn` Tailwind class. The S-07 UX risk was specifically flagged for this. Manual step 3.7 was marked [x] but the code shows no styling difference.
- **Fix**: Give one button a distinct visual treatment — e.g., make "Track new company" a filled/outline button while "Link to watched company" stays ghost.
- **Decision**: SKIPPED

### F3 — PATCH endpoint returns 404 for infrastructure errors (conflated with not-found)

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/analyses/[id].ts:82-86
- **Detail**: The `.single()` update call's error branch returned 404 for all errors, including transient DB failures. Only PGRST116 means "no rows"; other error codes silently looked like "analysis not found".
- **Fix**: Check `updateError.code === "PGRST116"` → 404; else 500. Mirror the pattern at src/pages/api/watchlist/index.ts:133.
- **Decision**: FIXED

### F4 — supabase-stub does not capture filter chain on update calls

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/\_harness/supabase-stub.ts:86-90
- **Detail**: `updateCalls` entries recorded only the updated row data — not the `.eq()` filter chain. Tests could verify what was written but not which row was targeted. A future regression removing `.eq("user_id", user.id)` would pass the test suite.
- **Fix A ⭐ Recommended**: Extend `updateCalls` to capture filters at resolution time — push `{ table, row, filters: { ...filters } }`.
  - Strength: Allows ownership-filter assertions; closes a coverage gap.
  - Tradeoff: Minor harness change — all existing tests still pass.
  - Confidence: HIGH — additive change; backward compatible.
  - Blind spot: Only covers .eq() filters.
- **Fix B**: Accept the gap — RLS is the real guard.
  - Strength: No code change; RLS enforces ownership at DB level in production.
  - Tradeoff: Tests rely on trusting RLS rather than asserting the code-level filter.
  - Confidence: MEDIUM.
  - Blind spot: Only safe as long as RLS policies are not accidentally changed.
- **Decision**: FIXED via Fix A

### F5 — Empty-string company_id not tested (endpoint treats "" as null)

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: tests/integration/api/analyses/id.patch.test.ts
- **Detail**: The endpoint was intended to treat `company_id: ""` as null. A new test exposed that the endpoint actually returned `company_id: ""` in the response (bug: `?? null` doesn't cover empty string). Both the endpoint and the test were fixed together.
- **Fix**: Added test for `company_id: ""` → 200 + `company_id: null`; normalized empty string to null in the endpoint.
- **Decision**: FIXED (also fixed a real endpoint bug exposed by the test)

### F6 — Watchlist JSON test missing unauthenticated path

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Success Criteria
- **Location**: tests/integration/api/watchlist/create.json.test.ts
- **Detail**: The PATCH test covers the 401 unauthenticated path; the watchlist JSON test didn't. Minor inconsistency in coverage depth between the two new test files.
- **Fix**: Added test for `user: null` returning 401 JSON on the watchlist JSON branch.
- **Decision**: FIXED

### F7 — buildApiContext hardcodes URL to /api/ai/run

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: tests/integration/\_harness/api-context.ts:23
- **Detail**: Request URL was always `https://app.local/api/ai/run` regardless of which route was under test. A future test wanting to exercise origin rejection on a route-specific URL couldn't.
- **Fix**: Added optional `path` parameter to `buildApiContext`; falls back to `/api/ai/run` when omitted.
- **Decision**: FIXED
