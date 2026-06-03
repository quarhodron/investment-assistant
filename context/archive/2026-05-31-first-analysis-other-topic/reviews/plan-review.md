<!-- PLAN-REVIEW-REPORT -->

# Plan Review: S-01 First Analysis on a Free-Text "Other" Topic

- **Plan**: context/changes/first-analysis-other-topic/plan.md
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: SOUND (after fixes)
- **Findings**: 0 critical, 3 warnings, 1 observation

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓

## Findings

### F1 — Topbar only included on landing page, not app pages

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 — Topbar navigation links
- **Detail**: Topbar.astro is only included by Welcome.astro → index.astro (the landing page). Dashboard, settings, and auth pages use Layout.astro directly — none include Topbar. Adding nav links to Topbar without including it in new pages would leave all four new app pages with no navigation.
- **Fix A ⭐ Recommended**: Include `<Topbar />` in each new app page individually — matches Welcome.astro pattern, zero disruption to existing pages.
- **Fix B**: Add Topbar to Layout.astro so all pages (including dashboard/settings) get nav automatically.
- **Decision**: FIXED via Fix B — plan updated to include Topbar in Layout.astro.

### F2 — SSE consumer parses lines manually; buffering guidance missing

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — SSE consumer, NewAnalysisForm.tsx
- **Detail**: The plan's SSE consumer pseudocode says "dispatch on `event:` line preceding each `data:` line" but gives no guidance on buffering partial chunks. Network chunking may split a frame mid-line or combine multiple frames in one chunk. `getReader()` returns raw `Uint8Array` chunks that must be decoded and buffered before frame extraction.
- **Fix**: Add buffered parse contract — accumulate decoded text, split on `\n\n` for complete frames, then extract `event:` and `data:` lines within each frame.
- **Decision**: FIXED — buffered parse contract added to the SSE consumer section.

### F3 — Manual test step 13 abort wording is misleading

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Testing Strategy — step 13
- **Detail**: Step 13 says "verify no orphaned analysis saved" after abort. Once the server emits `done`, the analysis is fully saved — a late-abort (after `done` emitted) legitimately saves the analysis. The test step should specify early-abort only.
- **Fix**: Clarify step 13 to specify early-abort and note that late-abort saving is expected correct behaviour.
- **Decision**: FIXED — test step 13 reworded.

### F4 — StoredSources field names: "confirm at implementation time" caveat now resolved

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — sources.ts helper
- **Detail**: The plan deferred confirming `.url` and `.title` field names to implementation time. Both have been confirmed: Anthropic `CitationsWebSearchResultLocation` has `.url: string` and `.title: string | null`; OpenAI `URLCitation` has `.url: string` and `.title: string`. Both providers use identical field names.
- **Fix**: Remove the caveat; state confirmed field names directly in the plan.
- **Decision**: FIXED — plan updated with confirmed field names.
