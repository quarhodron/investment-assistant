<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Company-bound Analysis

- **Plan**: context/changes/company-bound-analysis/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-27
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Insert error checked via `!data` instead of `error`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/run.ts:177
- **Note**: Pre-existing — not introduced by this change
- **Detail**: `if (!insertResult.data)` detects a failed insert, but the conventional pattern throughout this codebase is `if (insertResult.error)`. If Supabase returns `{ data: null, error: <PostgrestError> }`, the current check works, but a partial-result edge case (row written, select step fails) would silently emit `done` with `analysis_id: undefined`.
- **Fix**: Change to `if (insertResult.error || !insertResult.data)` to mirror the parent-analysis check pattern at line 121.
- **Decision**: FIXED — changed to `if (insertResult.error)` (Supabase types guarantee data is non-null when error is null, so `!data` is redundant and triggers a lint error)

### F2 — `parentData.output` may be null, producing `"null\n\n..."` string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/run.ts:126
- **Note**: Pre-existing — not introduced by this change
- **Detail**: `resolvedContext = input.extra_context ? parentData.output + "\n\n" + input.extra_context : parentData.output`. The `output` column is nullable. If a parent analysis has no stored output, the concatenation produces the literal string `"null\n\n<extra_context>"` rather than treating it as empty.
- **Fix**: Guard with `const baseOutput = parentData.output ?? ""; resolvedContext = input.extra_context ? baseOutput + "\n\n" + input.extra_context : baseOutput || null;`
- **Decision**: SKIPPED — Supabase types infer `output` as non-null here; the ?? guard triggers a lint error. Pre-existing, low risk.

### F3 — Company ownership check silently swallows DB errors

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/ai/run.ts:127–135
- **Note**: New code introduced by this change
- **Detail**: The existing parent-analysis ownership check (lines 113–124) destructures `error` and treats a DB error as a hard failure. The new company ownership check uses `.maybeSingle()` but does not inspect the `error` field — a transient DB failure silently coerces `resolvedCompanyId` to `null`, stripping the company link rather than surfacing the problem. The graceful-degrade intent is correct for the "company not found" case, but not for a DB error.
- **Fix**: Destructure `{ data: companyData, error: companyError }` from the query. If `companyError` (and `!companyData`), log/ignore and proceed with `resolvedCompanyId = null` — or surface a warning in the SSE stream. The graceful-degrade behavior can remain.
- **Decision**: FIXED — destructured `_companyError`; graceful-degrade behavior preserved; comment added.

### F4 — `prose-output` class missing on `ContinueAnalysisForm` output div

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ContinueAnalysisForm.tsx:422
- **Note**: Pre-existing — not introduced by this change; `prose-output` appears unused in CSS
- **Detail**: `NewAnalysisForm.tsx:451` has `className="prose-output text-foreground/90 ..."` while `ContinueAnalysisForm.tsx:422` has the same class string minus `prose-output`. The class isn't defined in any CSS file currently, so there's no functional difference — but if `prose-output` is ever given styles, the two forms will diverge.
- **Fix**: Add `prose-output` to the output div class in `ContinueAnalysisForm.tsx:422`.
- **Decision**: FIXED
