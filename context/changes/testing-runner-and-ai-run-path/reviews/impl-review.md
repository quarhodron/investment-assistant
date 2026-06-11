<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Test Runner + Critical AI Run Path

- **Plan**: `context/changes/testing-runner-and-ai-run-path/plan.md`
- **Scope**: Phases 1-6 of 6
- **Date**: 2026-06-05
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | WARNING |

## Verification

Automated checks run during review:

- `npm test` — PASS, 5 files / 23 tests passed.
- `npm run lint` — PASS.
- `npx astro sync` — PASS.
- `npx tsc --noEmit` — PASS.
- `npm run build` — PASS.
- `npm run format` — PASS, Prettier reported files unchanged.
- `grep -n "service_unavailable" src/pages/api/ai/run.ts` — PASS, no matches.
- `grep -c "TBD — see §3 Phase 1" context/foundation/test-plan.md` — PASS, `0`.
- `grep -c "TBD — see §3 Phase 2" context/foundation/test-plan.md` — PASS, `2`.

## Findings

### F1 — Unplanned source refactor committed inside rollout

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `src/pages/api/settings/api-keys.ts:53`
- **Detail**: Commit `0ae90eb` landed between Phase 1 and Phase 2 and changed files that are not in the plan's Changes Required list: `.gitignore`, `src/components/ContinueAnalysisForm.tsx`, `src/components/NewAnalysisForm.tsx`, `src/lib/services/api-key-crypto.ts`, `src/lib/utils.ts`, and `src/pages/api/settings/api-keys.ts`. Most edits are type-assertion cleanup, but they modify unrelated production surfaces during a test-runner/AI-run-path rollout and are not documented as an addendum.
- **Fix A ⭐ Recommended**: Document the unplanned commit as a plan addendum and explain why it was needed for the rollout.
  - Strength: Preserves already-passing work while restoring the plan as source of truth.
  - Tradeoff: Accepts some scope expansion after the fact.
  - Confidence: HIGH — the edits are visible in a single commit and do not currently fail gates.
  - Blind spot: I did not determine whether these edits were strictly necessary for TypeScript after adding tests.
- **Fix B**: Split the unrelated production edits into their own follow-up change or revert them if unnecessary.
  - Strength: Keeps this rollout narrowly scoped to the planned test harness and AI run path.
  - Tradeoff: More git hygiene work and possible conflict with typecheck fixes.
  - Confidence: MEDIUM — whether revert is safe depends on the original TypeScript failure that motivated the commit.
  - Blind spot: The pre-commit type errors before `0ae90eb` were not replayed.
- **Decision**: FIXED via Fix A — documented commit `0ae90eb` as a plan addendum.

### F2 — Stray debug comment left in shared utility

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/lib/utils.ts:7`
- **Detail**: `src/lib/utils.ts` ends with `// hell`. This is unrelated to the plan, adds no useful context, and leaves an unprofessional debug artifact in a shared utility imported by the new smoke test.
- **Fix**: Remove the stray `// hell` comment.
- **Decision**: FIXED — removed stray `// hell` comment.

### F3 — Route-level error table omits two provider failure classes

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `tests/integration/api/ai/run.errors.test.ts:320`
- **Detail**: Phase 4 says the integration table should assert every distinct route error code exactly once for Risk #6. The table drives `anthropic_api_error` through `POST /api/ai/run`, but it does not drive the same route catch path for `openai_api_error` or `unexpected_error`. `src/lib/services/ai/errors.test.ts` covers `toSafeAiError` in isolation, but it does not prove the route emits those SSE error frames or avoids inserts for those two provider failure classes.
- **Fix**: Add two `run.errors.test.ts` rows: one where the provider stream throws an `OpenAI.APIError` and expects `openai_api_error`, and one where it throws a plain `Error` and expects `unexpected_error`, both with `expectInsertCalls: 0`.
  - Strength: Matches Risk #6's route-level wording and keeps the table as the canonical error-surface map.
  - Tradeoff: Adds two near-duplicate rows to an already-large table.
  - Confidence: HIGH — the existing Anthropic row already proves the harness pattern.
  - Blind spot: If the plan intended provider classes to be unit-only, the Phase 4 wording should be clarified instead.
- **Decision**: FIXED — added route-level `openai_api_error` and `unexpected_error` provider stream rows.

### F4 — Happy-path smoke is not the planned no-parent run

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `tests/integration/api/ai/run.happy.test.ts:50`
- **Detail**: Phase 5 describes the happy-path smoke as a valid no-parent run, but `validBody` includes `parent_analysis_id: "parent-1"` and the stub returns parent output. The test still verifies the success path, final frame, and snapshot insert, so this is not a functional failure; it is a plan/test intent mismatch.
- **Fix**: Remove `parent_analysis_id` from `validBody` in the happy-path smoke, or update the plan to say this smoke intentionally covers a parent-backed successful run.
- **Decision**: FIXED — removed `parent_analysis_id` from the happy-path smoke so it is a no-parent run.
