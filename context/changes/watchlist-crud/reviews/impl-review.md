<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Watchlist CRUD

- **Plan**: context/changes/watchlist-crud/plan.md
- **Scope**: Phases 1 & 2 of 2
- **Date**: 2026-06-27
- **Verdict**: APPROVED
- **Findings**: 0 critical · 1 warning · 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Automated Criteria

- `npm run typecheck` — ✅ PASS
- `npm run lint` — ✅ PASS
- `npm run build` — ✅ PASS

## Findings

### F1 — node.id interpolated into inline onclick JS string

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/AnalysisTreeNode.astro:23
- **Detail**: `<summary>` onclick concatenates `node.id` into a JS string literal (`window.location.href = '/analyses/${node.id}'`). node.id is a DB UUID so real-world XSS risk is low, but the inline-handler + string-concat pattern is brittle and CSP-hostile. CONFIRMED pre-existing — introduced by commit 8dc4706, not by watchlist-crud; Phase 2 only added the company_name span to this file.
- **Fix**: Drive navigation from a `data-id` attribute read by a delegated `<script>` listener, matching the `data-*` pattern used in the edit pages.
- **Decision**: SKIPPED

### F2 — Corrupted Tailwind classes on "Open account" button

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/Topbar.astro:85
- **Detail**: `hover:bg-prhmary/80 iover:bg-primary/80 tracking-[0.08e` — typo'd color, garbage token, unclosed bracket. Hover bg and letter-spacing were broken. CONFIRMED pre-existing — commit b70abb3 ("update text sizes"), NOT watchlist-crud.
- **Fix**: Replace with `hover:bg-primary/80 tracking-[0.08em]`.
- **Decision**: FIXED

### F3 — EXTRA form-value echo not in plan (benign)

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/watchlist/index.ts:33-38, src/pages/api/watchlist/[id].ts:57-62
- **Detail**: Both API routes append submitted values (`_name`, `_ticker`, …) to error redirects so the form repopulates on validation failure. Not in the plan, absent from the prompts sibling. Safe (encodeURIComponent out, Astro auto-escape in) and consistently applied across all four watchlist files.
- **Fix**: Note in plan as an intentional UX addendum.
- **Decision**: FIXED — noted in plan addendum
