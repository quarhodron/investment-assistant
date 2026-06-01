# S-02: Continue-Analysis Chain — Plan Brief

> Full plan: `context/changes/continue-analysis-chain/plan.md`

## What & Why

Build the core product differentiator: a user can open any saved analysis and run "Continue analysis" with a different prompt and/or model, with the parent's full AI output forwarded verbatim as context. The new analysis is saved as a child linked via `parent_analysis_id`, and detail pages render the chain in both directions. This is the validation milestone — the smallest slice that proves the product hypothesis and makes Investment Assistant more than a CRUD list of one-shot prompts.

## Starting Point

S-01 is complete. The schema already has `parent_analysis_id` (FK, nullable, `ON DELETE SET NULL`) with a traversal index. The `/api/ai/run.ts` endpoint already stores `parent_analysis_id` from the request body, and `validateRunInput()` already extracts it. What's missing: context composition in the server, the UI entry point on the detail page, the continuation form, and chain display.

## Desired End State

From any analysis detail page, the user sees a "Continue analysis" button. Clicking it opens a pre-filled form at `/analyses/<id>/continue` where they adjust prompt, model, and optionally extra context, then run. The AI receives the parent's full output verbatim as leading context. After save, the child's detail page shows "Continued from: <parent title>" and the parent's detail page shows "Continued as: <child title>" — the chain is traversable hop-by-hop.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Navigation to continue form | New page `/analyses/[id]/continue` | Matches the existing `/analyses/new.astro` pattern; clean URL with back-button support |
| Form fields shown | Full form pre-filled from parent | User wants full control over all fields, not just prompt/model |
| Context composition | Server fetches parent output at run time | Client cannot tamper with the context; always authoritative |
| Chain display depth | Immediate parent link + direct children list | Simple, sufficient for v1 chains; recursive breadcrumbs deferred |
| `analysis_type` in form | Pre-filled from parent, editable | Maximum flexibility; company picker (S-06) is out of scope here |
| Title default | `"Continue: <parent title>"` (truncated 290 chars) | Communicates lineage in analyses list without ambiguity |
| Parent-not-found behaviour | SSE error frame; form unfreezes | Consistent with existing API error patterns; no silent corruption |

## Scope

**In scope:**
- Server-side parent fetch + context composition in `/api/ai/run.ts`
- "Continue analysis" button on `/analyses/[id].astro`
- `/analyses/[id]/continue.astro` page + `ContinueAnalysisForm.tsx` island
- Parent link + children list on the analysis detail page (one hop each direction)

**Out of scope:**
- Company-type continuation with watchlist picker (S-06)
- Recursive chain breadcrumbs / tree visualization
- Auto-summarization of parent output (deferred to v2 per PRD Open Questions §4)
- Chain metadata on the analyses list page (S-03)

## Architecture / Approach

Three isolated server round-trips: (1) page load of `/analyses/[id]/continue` fetches parent analysis + prompts + models, (2) form submit hits `POST /api/ai/run` which internally queries the parent's output before calling `runAiAnalysis`, (3) detail page load queries parent title and children list via `analyses_user_parent_idx`. No new API routes. No DB migrations. The `ContinueAnalysisForm` island is a new file modelled on `NewAnalysisForm.tsx` — shares the SSE consumer and abort pattern; differs in props and pre-fill.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API Context Composition | Parent output flows verbatim into AI context; parent-not-found returns clear SSE error | Context composition must not break the normal (non-continuation) flow |
| 2. Continue Page & Form | End-to-end continuation flow is live; "Continue analysis" button on detail page | `ContinueAnalysisForm` pre-fill logic must handle edge cases (parent prompt deleted, etc.) |
| 3. Chain Display | Detail pages show parent ↔ child links; chain is traversable | Two extra Supabase queries per detail page load — both use indexed columns |

**Prerequisites:** S-01 fully complete (at least one saved analysis must exist for manual testing). No DB migrations needed.  
**Estimated effort:** ~1 session across 3 phases

## Open Risks & Assumptions

- Parent output can be large (several KB of AI prose); it is sent as part of the AI request context. Token cost grows with chain depth — this is acknowledged in PRD Business Logic #2 and deferred to v2 for mitigation.
- The `analysis_type` editable select allows switching from `other` to `company` without a company picker; the user would need to enter a free-text subject. This is intentionally allowed but the company-bound path (S-06) is not tested in this slice.

## Success Criteria (Summary)

- A saved analysis can be continued with a different prompt/model; the child is saved linked to the parent
- The AI response demonstrably reflects the parent's output content (context was forwarded)
- Parent and child detail pages show navigable chain links in both directions
