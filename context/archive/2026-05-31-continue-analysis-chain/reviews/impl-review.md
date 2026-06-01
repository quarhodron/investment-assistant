<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Continue-Analysis Chain

- **Plan**: context/changes/continue-analysis-chain/plan.md
- **Scope**: All phases (1–3)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical  5 warnings  4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — "Continue analysis" button relocated to header area

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/analyses/[id]/index.astro:83–93
- **Detail**: Plan specified the button below the AI output section, before Sources. Implementation placed it in the title/metadata header area at the top of the page. Same location applies to "Continued as:" children list (F2). Both are consistent with each other — a deliberate UX consolidation that keeps chain navigation visible without scrolling.
- **Fix**: Accept the drift — header placement is better UX. Mark as intentional.
- **Decision**: ACCEPTED — intentional layout consolidation

### F2 — "Continued as:" section relocated to header area

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/analyses/[id]/index.astro:94–114
- **Detail**: Plan specified "Continued as:" below the Sources collapsible. Same root decision as F1 — chain navigation consolidated to the header area.
- **Fix**: Accept the drift — same justification as F1.
- **Decision**: ACCEPTED — intentional layout consolidation

### F3 — Children links missing created_at date display

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/analyses/[id]/index.astro:101–109
- **Detail**: Plan specified each child link renders with title and created_at date. The created_at field is fetched from the DB but was not rendered — only {child.title} appeared.
- **Fix**: Add date display alongside each child title.
- **Decision**: FIXED — added `<span class="ml-2 text-xs text-slate-400">{new Date(child.created_at).toLocaleDateString()}</span>` next to each child title link.

### F4 — parent_analysis_id accepted without UUID format validation

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/validation.ts:85
- **Detail**: validateRunInput passes parent_analysis_id through as any non-empty string. The downstream Supabase query enforces user_id, preventing cross-user access. Non-UUID strings cause unnecessary DB round-trips.
- **Fix**: Add UUID format check in validateRunInput.
- **Decision**: SKIPPED

### F5 — No empty-state for models.length === 0 in ContinueAnalysisForm

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ContinueAnalysisForm.tsx
- **Detail**: When models is empty, Run button is permanently disabled with no explanation. NewAnalysisForm has the same pre-existing gap.
- **Fix**: Add models.length === 0 guard returning an explanatory card.
- **Decision**: SKIPPED

### F6 — Sequential parent + children fetches (could be parallel)

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/analyses/[id]/index.astro:32–48
- **Detail**: Parent title fetch and children fetch were two sequential awaits. Both depend only on the already-resolved analysis object — extra round-trip on every detail page load.
- **Fix**: Wrap in Promise.all([...]).
- **Decision**: FIXED — parallelized with Promise.all.

### F7 — title maxLength 300 in ContinueAnalysisForm vs 200 in NewAnalysisForm

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ContinueAnalysisForm.tsx (title input); src/lib/validation.ts:64
- **Detail**: ContinueAnalysisForm used maxLength={300} while NewAnalysisForm used maxLength={200}. No server-side cap existed in validateRunInput. DB column is 300 chars.
- **Fix**: Align NewAnalysisForm to maxLength={300} and add server-side title length validation.
- **Decision**: FIXED — NewAnalysisForm maxLength updated to 300; validateRunInput now rejects titles over 300 chars with title_too_long error.

### F8 — prompt_name_snapshot fetched in continue.astro but missing from interface

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/analyses/[id]/continue.astro:20
- **Detail**: Supabase select fetches prompt_name_snapshot but the ParentAnalysis interface in ContinueAnalysisForm.tsx doesn't declare it. Silently unused.
- **Fix**: Remove prompt_name_snapshot from the select.
- **Decision**: SKIPPED

### F9 — Double-redirect when parent not found in continue.astro

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/analyses/[id]/continue.astro:33–35
- **Detail**: Redirected to /analyses/<id> when parent not found. That detail page would itself 404 and redirect to /analyses — a double-redirect. new.astro redirects directly to /analyses.
- **Fix**: Change redirect target to /analyses.
- **Decision**: FIXED — redirect target changed to /analyses to match new.astro pattern.
