# S-01: First Analysis on a Free-Text "Other" Topic — Plan Brief

> Full plan: `context/changes/first-analysis-other-topic/plan.md`

## What & Why

Build the first user-visible end-to-end slice: a signed-in user creates a prompt, runs an AI analysis on a free-text "other" topic, sees the streaming result, and can reopen the saved read-only result. This slice exists because S-02 (the north-star "continue-analysis" milestone) can only be tested once at least one saved analysis exists — S-01's job is to make that first analysis minimal, correct, and end-to-end.

## Starting Point

F-01 and F-02 are done: schema with RLS, the full `/api/ai/run.ts` SSE endpoint, API key encryption and settings UI, and the AI provider streaming client all exist. What's missing are the four user-facing pages and the prompts API route.

## Desired End State

A user lands on `/analyses/new`, is guided to create a prompt if none exist, fills in a topic and model, watches the AI output stream inline, and sees a "Saved — view analysis" link when complete. The detail page at `/analyses/[id]` shows the full result, collapsible sources, prompt metadata, and a "not investment advice" notice. All surfaces are reachable via Topbar navigation.

## Key Decisions Made

| Decision               | Choice                                              | Why (1 sentence)                                                      |
| ---------------------- | --------------------------------------------------- | --------------------------------------------------------------------- |
| Streaming display      | Inline below the form, form stays visible           | Simplest state machine; matches the SSE endpoint's design             |
| Post-save UX           | Stay on page, show "Saved" + link to detail         | User can finish reading before navigating; no abrupt redirect         |
| Sources rendering      | Collapsible panel below output                      | Keeps output uncluttered for analyses with many citations             |
| Empty-state prompt CTA | Link to `/prompts` page, not inline modal           | Matches US-01 acceptance criteria; no modal scope                     |
| Run error handling     | Inline error, discard partial output, unfreeze form | Satisfies PRD guardrail (failed run must not corrupt data)            |
| Navigate-away abort    | AbortController on unmount, silent discard          | Clean resource cleanup; `/api/ai/run.ts` already handles abort signal |
| Topbar nav             | Add Analyses, Prompts, New Analysis links           | All major surfaces reachable; no Dashboard-CTA dependency             |

## Scope

**In scope:**

- `POST /api/prompts` — create a prompt
- `/prompts` — list + create form (no edit/delete — S-04)
- `/analyses/new` — run form with SSE streaming (type=`other` only)
- `/analyses` — reverse-chronological list
- `/analyses/[id]` — read-only detail (output, sources, prompt snapshot, "not investment advice" notice)
- Topbar nav links for all new pages
- `PROTECTED_ROUTES` extended to cover `/prompts` and `/analyses`
- `src/lib/sources.ts` helper to flatten discriminated `StoredSources` union for rendering

**Out of scope:**

- Prompt edit / delete (S-04)
- Analyses list filtering (S-03)
- Continue analysis (S-02)
- Company-type analysis (S-06)
- Dashboard recent panel (S-08)
- Markdown rendering of AI output
- Token/cost display (FR-033, nice-to-have)

## Architecture / Approach

Three-layer pattern consistent with the existing codebase: Astro page frontmatter does the Supabase queries and passes typed props down; React islands (with `client:load`) own all interactive state; API routes handle mutations with POST-redirect-GET. The `NewAnalysisForm.tsx` island owns the most complex state machine: a single `status` discriminant (`idle → streaming → saved | error`) drives all rendering. The SSE consumer uses `response.body.getReader()` to parse delta/done/error frames from the existing `/api/ai/run.ts` endpoint with no server-side changes required.

## Phases at a Glance

| Phase                                    | What it delivers                                                            | Key risk                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1. Prompts, Navigation, Route Protection | Prompt CRUD + Topbar nav + protected routes                                 | Low — straightforward CRUD following existing patterns                                             |
| 2. New Analysis — Form, Streaming, Save  | The core interactive island: SSE consumer, empty-state CTAs, error handling | Medium — SSE consumer state machine has several edge cases (abort, error frame, provider mismatch) |
| 3. Analyses List and Detail View         | Read-only list + detail with sources, metadata, advice notice               | Low — static Astro pages; `StoredSources` union type requires care when flattening                 |

**Prerequisites:** F-01 (schema + RLS) and F-02 (API keys + AI client) — both done.
**Estimated effort:** ~3 sessions across 3 phases.

## Open Risks & Assumptions

- `StoredSources` exact field names (`url`, `title`) depend on the SDK types in `src/lib/services/ai/anthropic.ts` and `openai.ts` — the `flattenSources` helper must be verified against those types at implementation time.
- The `title` field for an analysis is user-derived (auto-filled from the first 100 chars of the topic input). There is no AI-generated title in v1 — this is intentional.
- No input validation library is introduced; inline guards in `/api/prompts` mirror the pattern in `src/lib/validation.ts`.

## Success Criteria (Summary)

- A user starting from an empty account can reach the end of the US-01 user story: create prompt → configure API key (Settings, already built) → run analysis → see streaming result → open saved detail.
- Every analysis detail page shows the "not investment advice" notice (PRD guardrail).
- A failed run does not save any data and the user sees a clear error with the form still populated.
