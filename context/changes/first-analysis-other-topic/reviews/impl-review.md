<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 First Analysis on a Free-Text "Other" Topic

- **Plan**: context/changes/first-analysis-other-topic/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-05-31
- **Verdict**: NEEDS ATTENTION (resolved via triage)
- **Findings**: 1 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | CRITICAL (fixed) |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Undefined function call crashes null-body code path

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/NewAnalysisForm.tsx:151
- **Detail**: `setErrorMsg(...)` called when `response.body` is null, but no such function exists. Would throw ReferenceError at runtime.
- **Fix**: Replace with `setErrorFrame({ message: "No response stream received." }); setStatus("error");`
- **Decision**: FIXED

### F2 — Fragile delta cast — works now but breaks if server shape changes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Pattern Consistency
- **Location**: src/components/NewAnalysisForm.tsx:187–190
- **Detail**: Delta data parsed as `Record<string, unknown>` then cast to string — works because server sends a bare JSON string, but hides the true type. If server wraps delta in an object, silently appends `[object Object]`.
- **Fix**: Parse delta inline: `setOutput((prev) => prev + (JSON.parse(dataLine) as string))` separate from done/error frames.
- **Decision**: FIXED

### F3 — No CSRF Origin check on /api/ai/run (paid external API call)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency / Safety & Quality
- **Location**: src/pages/api/ai/run.ts (top of POST handler)
- **Detail**: Every other state-changing route has an Origin guard; run.ts was missing it despite making paid API calls and inserting rows.
- **Fix A ⭐ Recommended**: Add Origin guard returning 403 (JSON/SSE endpoint, not redirect).
- **Decision**: FIXED via Fix A

### F4 — Description validation has dead null-assignment before early return

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/prompts/index.ts:37–46
- **Detail**: descValue set to null for oversized description (dead code), then same condition checked again to redirect. Reordering could silently persist invalid data.
- **Fix**: Validate first, then assign — remove the dead null-assignment.
- **Decision**: FIXED

### F5 — MarkdownOutput.tsx is unplanned scope (benign)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/components/MarkdownOutput.tsx
- **Detail**: Plan specified `<pre>` for AI output; a ReactMarkdown island was added at user request. Correct and improves UX but plan didn't reflect it.
- **Fix**: Added plan addendum in Phase 3 Changes Required.
- **Decision**: FIXED

### F6 — Analyses list query has no pagination limit

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/analyses/index.astro:12–20
- **Detail**: Unbounded query; analyses are append-only and list only grows.
- **Fix**: Add .limit(50); full pagination in S-03.
- **Decision**: SKIPPED

### F7 — flattenSources has no guard against missing items array

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/sources.ts:5
- **Detail**: `sources.items` accessed unconditionally; malformed persisted rows would throw.
- **Fix**: Add `!Array.isArray(sources.items)` guard.
- **Decision**: FIXED
