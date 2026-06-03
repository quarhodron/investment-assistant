<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: API Keys and AI Provider Client (F-02)

- **Plan**: context/changes/api-keys-and-ai-provider-client/plan.md
- **Scope**: All 4 Phases
- **Date**: 2026-05-31
- **Verdict**: NEEDS ATTENTION (resolved via triage)
- **Findings**: 0 critical · 4 warnings · 3 observations

## Verdicts

| Dimension           | Verdict      |
| ------------------- | ------------ |
| Plan Adherence      | PASS         |
| Scope Discipline    | PASS         |
| Safety & Quality    | FAIL → FIXED |
| Architecture        | PASS         |
| Pattern Consistency | PASS         |
| Success Criteria    | PASS         |

## Findings

### F1 — Double controller.close() on every early-exit path

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/run.ts (5 early-exit guards)
- **Detail**: Every early-return inside the try block called controller.close() before return. The finally block unconditionally closed again, causing a TypeError on the already-closed controller per WHATWG ReadableStream spec.
- **Fix**: Removed all explicit controller.close() calls before early returns; the finally block alone handles cleanup.
- **Decision**: FIXED

### F2 — No upper-bound validation on run-input text fields

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation.ts:55–65
- **Detail**: validateRunInput checks for non-empty strings but no maximum length on prompt_body, input, extra_context, title, subject.
- **Fix**: Add max-length checks (e.g. prompt_body ≤ 32 KB, input/extra_context ≤ 16 KB, title/subject ≤ 256 chars).
- **Decision**: SKIPPED — v1 is single-digit users; provider rate limits are the gate.

### F3 — AI provider streams not aborted on generator error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/ai/anthropic.ts, openai.ts
- **Detail**: Neither generator wrapped stream iteration in try/finally. On mid-stream exception, the underlying SDK stream was not explicitly aborted, potentially holding open connections to upstream providers.
- **Fix**: Added try/finally in each generator; anthropic.ts calls stream.abort() if !stream.aborted; openai.ts calls stream.controller.abort().
- **Decision**: FIXED (Fix A)

### F4 — CSRF on form-based settings endpoints

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/settings/api-keys.ts, default-model.ts
- **Detail**: Supabase SSR sets auth cookies SameSite=Lax. A cross-site attacker could construct an HTML form that POSTs to settings routes, causing victim's session cookie to be included.
- **Fix**: Added Origin header check at the top of both POST handlers; rejects cross-origin requests with a forbidden redirect.
- **Decision**: FIXED (Fix A)

### F5 — DB error and missing-row conflated in run.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ai/run.ts:58, 81
- **Detail**: if (!result.data) collapsed a genuine DB error and a missing row into the same message. Also removed the now-redundant !settingsResult.data check (TypeScript narrows data to non-null after the error check with .single()).
- **Fix**: Added explicit .error checks emitting service_unavailable before the .data guards.
- **Decision**: FIXED

### F6 — Two sequential DB queries could be parallelised in run.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: src/pages/api/ai/run.ts:56, 71
- **Detail**: user_settings and ai_models were fetched sequentially despite both inputs being known upfront.
- **Fix**: Replaced with Promise.all([settingsQuery, modelQuery]).
- **Decision**: FIXED

### F7 — No defensive break after processing done event in run.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Data Safety)
- **Location**: src/pages/api/ai/run.ts (~line 154)
- **Detail**: The for-await loop relied on generator exhaustion after kind:'done'. A future generator yielding after done could trigger a second INSERT.
- **Fix**: Added break after the enqueue(sseFrame("done", ...)) call.
- **Decision**: FIXED

### F8 — Inconsistent error-response style between settings routes and run.ts

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: api/settings/api-keys.ts, api/settings/default-model.ts vs api/ai/run.ts
- **Detail**: Settings routes redirect on error (correct for browser form handlers); run.ts returns SSE error frames (correct for streaming API). Intentional and appropriate.
- **Decision**: SKIPPED
