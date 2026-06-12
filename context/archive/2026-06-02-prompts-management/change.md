---
change_id: prompts-management
title: Prompts management
status: archived
created: 2026-06-02
updated: 2026-06-12
archived_at: 2026-06-12T07:42:15Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

## Opportunistic fixes (unplanned)

- `src/components/ContinueAnalysisForm.tsx` and `src/components/NewAnalysisForm.tsx` — default model selection now prefers the first model whose provider has a configured API key, falling back to `models[0]`. Included in the Phase 1 commit as a 2-line fix noticed during implementation.
- `supabase/migrations/20260529120000_data_schema_and_rls.sql` — removed `analyses_immutability_guard` trigger and `analyses_immutable()` function. FR-020 (analyses immutability) intentionally relaxed; no prod users at time of change so direct migration edit was acceptable. A future plan will update the PRD/roadmap to reflect the new mutability policy.
