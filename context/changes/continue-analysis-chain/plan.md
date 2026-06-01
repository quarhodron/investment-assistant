# S-02: Continue-Analysis Chain — Implementation Plan

## Overview

Build the north-star wedge feature: from any saved analysis detail view, the user clicks "Continue analysis", lands on a pre-filled form, picks a different prompt and/or model, and runs. The new analysis is saved as a child linked via `parent_analysis_id`. The server fetches the parent's full AI output at run time and passes it verbatim as context (Business Logic #2). Detail pages render parent ↔ child linkage so the chain is traversable in both directions.

## Current State Analysis

S-01 is complete. What's in place:

- **Schema**: `analyses.parent_analysis_id` self-referencing FK (`ON DELETE SET NULL`), nullable, with a dedicated traversal index `analyses_user_parent_idx ON analyses (user_id, parent_analysis_id) WHERE parent_analysis_id IS NOT NULL` — from `supabase/migrations/20260529120000_data_schema_and_rls.sql:125,202`.
- **API endpoint**: `/api/ai/run.ts:141` already stores `parent_analysis_id: input.parent_analysis_id ?? null`. No parent-context logic yet.
- **Validation**: `validateRunInput()` at `src/lib/validation.ts:85` already extracts `parent_analysis_id` as optional string. No server-side existence check.
- **AI client**: `runAiAnalysis` at `src/lib/services/ai/index.ts:33` accepts `context?: string`. Currently `run.ts:115` passes `context: input.extra_context`. For continuations, `context` must carry the parent's full `output` instead.
- **Detail page**: `src/pages/analyses/[id].astro` (will be renamed to `[id]/index.astro` in Phase 2) — no "Continue analysis" button, no chain links, query uses `select("*")` but renders nothing from `parent_analysis_id` or child analyses.
- **NewAnalysisForm.tsx**: 385-line island. Does not pass `parent_analysis_id`. Will be the model for the new `ContinueAnalysisForm.tsx`.

## Desired End State

From `/analyses/<id>`, the user sees a "Continue analysis" button. Clicking it navigates to `/analyses/<id>/continue` — a server-rendered page that pre-fills prompt, model, topic, title (`"Continue: <parent title>"`), and `analysis_type` (editable). Extra context opens empty — the user provides fresh context for this continuation run. The user adjusts and clicks Run. The server fetches the parent analysis, confirms the user owns it, passes its `output` verbatim as the `context` arg to `runAiAnalysis`, and saves the resulting analysis with `parent_analysis_id` set. After save, the user is linked to the new child's detail page. The parent detail page now shows the child in a "Continued as:" section; the child detail page shows "Continued from: <parent title>" above the header.

### Key Discoveries:

- `run.ts:115` — `context: input.extra_context` — this line is the only change needed to wire context composition. For a continuation, the context is the parent's output; `extra_context` from the form is secondary. Resolution: server fetches parent output, builds composed context = `parent_output + (extra_context ? "\n\n" + extra_context : "")`, passes as `context`.
- `validation.ts:85` — `parent_analysis_id` is already extracted from the request body. No changes to validation are needed.
- `analyses_user_parent_idx` — composite index on `(user_id, parent_analysis_id)` is already in place for the children query on the detail page.
- `[id].astro` uses `.select("*")` — no schema changes needed to read `parent_analysis_id`; the column is already returned.
- The `ContinueAnalysisForm` shares most logic with `NewAnalysisForm` (same SSE consumer, same payload shape) but has different props and pre-fill behaviour — new file is the right call to avoid branching the existing island.

## What We're NOT Doing

- No company-type continuation UI — analysis_type is pre-filled from parent (editable), but the company picker (S-06) is not built here. If user switches type to `company` they can type a free-text subject; the watchlist picker is out of scope.
- No recursive chain breadcrumb — only immediate parent link and direct children list (one hop each direction). Full traversal is deferred.
- No auto-summarization of parent output — verbatim context as per Business Logic #2. v1 does not trim or summarize.
- No chain visualization / tree view — linear links only.
- No changes to the analyses list page (`/analyses`) — chain metadata is not shown there in this slice.

## Implementation Approach

Three phases, each independently verifiable:

1. **Phase 1 (API)** — minimal server-side change: when `parent_analysis_id` is set, fetch the parent analysis inside `run.ts`, validate the user owns it (or return SSE error), compose `context = parent.output + extra_context` and pass to `runAiAnalysis`. This is pure backend logic, no UI change.
2. **Phase 2 (Continue page + button)** — new `/analyses/[id]/continue.astro` page + `ContinueAnalysisForm.tsx` island, "Continue analysis" button on the detail page. The end-to-end flow is functional after this phase.
3. **Phase 3 (Chain display)** — update the detail page query to also fetch the parent title (via a second query on parent_analysis_id) and direct children (via `analyses_user_parent_idx`), then render the linkage in the template.

## Critical Implementation Details

**Context composition in `run.ts`**: When `input.parent_analysis_id` is set, a Supabase query must run inside the existing `stream.start()` async block — the query must check `user_id = user.id` to prevent cross-user parent access. If the query returns no row, emit `sseFrame("error", { message: "parent_not_found" })` and return, matching the existing guard pattern (e.g. lines 83–86, 92–95). The composed context is `parent.output` alone if `extra_context` is absent, or `parent.output + "\n\n" + input.extra_context` if present. This replaces (not appends to) the `context: input.extra_context` assignment at line 115.

**`ContinueAnalysisForm` props**: The page fetches the parent analysis server-side and passes `parentAnalysis` (id, title, analysis_type, input, extra_context, prompt_name_snapshot, prompt_body_snapshot) as a prop to the island. The island does not re-fetch. It pre-fills: prompt selector to the parent's `prompt_id` if still present in the user's prompts list (fallback to first prompt), model to `defaultModelId`, analysis_type to parent's `analysis_type` (editable select), input to parent's `input`, extra_context empty, title to `"Continue: " + parent.title` (truncated at 290 chars to stay within the 300-char DB constraint).

**`analysis_type` in the form**: Since S-02 ships the "other" path and the company picker (S-06) is deferred, the `analysis_type` select should show both options as editable, but the `subject` field behaviour follows the same rule as `NewAnalysisForm` — for type `other`, `subject = input`.

---

## Phase 1: API Context Composition

### Overview

When `parent_analysis_id` is present in the run payload, the server fetches the parent analysis inside the SSE stream handler, validates ownership, and composes the context from the parent's full output. If the parent is not found or not owned by the requesting user, an SSE error is returned immediately. No UI changes in this phase.

### Changes Required:

#### 1. Server-side parent fetch and context composition

**File**: `src/pages/api/ai/run.ts`

**Intent**: After the existing API-key validation block (before the `runAiAnalysis` call at line 110), add a conditional branch: if `input.parent_analysis_id` is set, fetch the parent analysis from Supabase, verify `user_id` matches, extract `parent.output`, and build the composed context string. If the parent is not found, emit an SSE error frame and return. Pass the composed context (or the plain `extra_context` for non-continuations) into `runAiAnalysis`.

**Contract**: Insert after line 108 (after the `apiKey` is resolved, before `runAiAnalysis`). New logic:
- Query: `supabase.from("analyses").select("output").eq("id", input.parent_analysis_id).eq("user_id", user.id).single()`
- If `error` or `!data`: `enqueue(sseFrame("error", { message: "parent_not_found" })); return;`
- Build `context`: `parentData.output + (input.extra_context ? "\n\n" + input.extra_context : "")`
- Replace the existing `context: input.extra_context` at line 115 with `context: resolvedContext` where `resolvedContext` is the composed value (or `input.extra_context` when no parent).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npm run build` completes without TypeScript errors

#### Manual Verification:

- `POST /api/ai/run` with a valid `parent_analysis_id` owned by the user runs and saves a child analysis with the parent's output prepended as context. **Phase 1 is most efficiently verified as part of Phase 2 testing** — step 2.9 confirms context was forwarded by observing the AI output. To isolate Phase 1 alone: use the browser Network tab after running a real continuation from the Phase 2 UI, inspect the `/api/ai/run` request payload to confirm `parent_analysis_id` was sent, and verify the AI response references the parent content.
- `POST /api/ai/run` with a `parent_analysis_id` that does not exist returns an SSE error frame `{ message: "parent_not_found" }`
- `POST /api/ai/run` with a `parent_analysis_id` belonging to a different user returns `{ message: "parent_not_found" }` (RLS + `user_id` filter)
- `POST /api/ai/run` without `parent_analysis_id` (normal new-analysis flow) still works unchanged

**Implementation Note**: After this phase passes manual verification, proceed to Phase 2.

---

## Phase 2: Continue Page, Form, and Detail Button

### Overview

Add the `ContinueAnalysisForm.tsx` island and the `/analyses/[id]/continue.astro` page. Add a "Continue analysis" button to the existing detail page. After this phase the full end-to-end flow is functional.

### Changes Required:

#### 0. Rename detail page to enable directory routing

**File**: `src/pages/analyses/[id].astro` → `src/pages/analyses/[id]/index.astro`

**Intent**: Astro cannot have both `[id].astro` (a file) and `[id]/continue.astro` (inside a directory) at the same path. Rename the existing detail page to `[id]/index.astro` — Astro's directory-index convention preserves the `/analyses/<uuid>` URL identically while making `/analyses/<uuid>/continue` a valid sibling route.

**Contract**: Pure file rename, no content changes. URL behavior is unchanged; all existing links to `/analyses/<uuid>` continue to resolve correctly.

#### 1. "Continue analysis" button on the detail page

**File**: `src/pages/analyses/[id]/index.astro`

**Intent**: Add a "Continue analysis" button below the AI output section (before the sources collapsible). Navigates to `/analyses/<id>/continue`.

**Contract**: Render an `<a>` styled as a button (use existing shadcn `button` class pattern or `<Button>` as an Astro import is not available — use inline Tailwind). `href={"/analyses/" + analysis.id + "/continue"}`. Label: "Continue analysis". Place it between the output block and the sources collapsible (after line ~86 in current file).

#### 2. ContinueAnalysisForm React island

**File**: `src/components/ContinueAnalysisForm.tsx`

**Intent**: Handles the full lifecycle of a continuation run: pre-filled form → streaming → saved/error. Mirrors `NewAnalysisForm.tsx` structurally but is pre-filled and includes `parent_analysis_id` in the payload.

**Contract**: Props:
```
parentAnalysis: { id: string; title: string; analysis_type: string; input: string; extra_context: string | null; prompt_id: string | null; }
prompts: Pick<Prompt, "id" | "name" | "description" | "body">[]
models: AiModel[]
apiKeyStatus: { anthropic: boolean; openai: boolean }
defaultModelId: string | null
```

State machine (same as `NewAnalysisForm`): `idle → streaming → saved | error`.

**Pre-fill on mount** (initial state values):
- `promptId`: parent's `prompt_id` if it exists in the `prompts` prop list, else first prompt's id
- `modelId`: `defaultModelId` if set, else first enabled model
- `analysisType`: parent's `analysis_type` (editable `<select>` with both options)
- `input`: parent's `input` (textarea, editable)
- `extraContext`: `""` (empty — user provides new extra context for this continuation run; the parent's `extra_context` is carried in the `parentAnalysis` prop for server-side context composition only, not pre-filled into the textarea)
- `title`: `"Continue: " + parent.title.slice(0, 290)` (editable)

**Payload** sent to `POST /api/ai/run` — same shape as `NewAnalysisForm` with these additions:
- `parent_analysis_id: parentAnalysis.id`
- `analysis_type`: from the editable select (pre-filled from parent)
- `subject`: same as `input` for type `other`

SSE consumer and abort-on-unmount pattern: identical to `NewAnalysisForm.tsx` — copy the `abortRef` + `useEffect` teardown. No changes to the stream parsing logic.

**Empty-state CTAs**: same as `NewAnalysisForm` — if `prompts.length === 0`, show a CTA to `/prompts`; if selected provider has no API key, show the "Configure API key" alert and disable Run.

#### 3. Continue analysis page

**File**: `src/pages/analyses/[id]/continue.astro`

**Intent**: Server-rendered shell that fetches the parent analysis and the data needed by `ContinueAnalysisForm`, then mounts the island. Redirects to `/analyses/<id>` if the analysis is not found or doesn't belong to the user.

**Contract**: Same parallel-query pattern as `new.astro` (prompts, models, user_settings). Additionally fetch: `supabase.from("analyses").select("id, title, analysis_type, input, extra_context, prompt_id, prompt_name_snapshot").eq("id", id).eq("user_id", user.id).single()`. If error or no data: `return Astro.redirect("/analyses/" + id)`. Pass `parentAnalysis` as prop to `<ContinueAnalysisForm ... client:load />`.

Page title: `"Continue: " + parentAnalysis.title` (same pattern as `Layout` title prop).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npm run build` completes without TypeScript errors

#### Manual Verification:

- "Continue analysis" button is visible on `/analyses/<id>` for any saved analysis
- Clicking it navigates to `/analyses/<id>/continue`
- Continue form pre-fills: prompt (parent's prompt selected if still in list), model (default), analysis_type (parent's), input (parent's input), title (`"Continue: <parent title>"`)
- Title is editable; all other fields are editable
- User with no prompts sees the "Create your first prompt" CTA
- User whose selected provider has no API key sees the "Configure API key" alert
- Submitting a valid continuation runs the stream; output appears delta-by-delta
- On completion: "Saved — view analysis" link appears, pointing to `/analyses/<child-id>`
- The child analysis saved in the DB has `parent_analysis_id` set to the parent's id (verify via `/analyses/<child-id>` after Phase 3 adds chain display — or check Supabase Studio directly)
- Error path: if the parent analysis is deleted between page load and form submit, the inline error "parent_not_found" message is shown and the form unfreezes
- Navigating away mid-stream aborts cleanly (no console errors)

**Implementation Note**: After this phase passes manual verification, proceed to Phase 3.

---

## Phase 3: Chain Display on Detail Page

### Overview

Update `/analyses/[id].astro` to show parent ↔ child linkage. A "Continued from" link appears above the header when the analysis has a parent; a "Continued as" list appears after the sources section when there are children. Both are fetched server-side using the existing `analyses_user_parent_idx`.

### Changes Required:

#### 1. Enhanced detail page query + chain rendering

**File**: `src/pages/analyses/[id]/index.astro`

**Intent**: After the existing analysis query, conditionally fetch: (a) the parent analysis title if `analysis.parent_analysis_id` is set, and (b) all direct child analyses (id, title, created_at) ordered by `created_at` ascending. Add two UI sections to the template.

**Contract**: Two additional queries (run only when relevant):
- Parent: `supabase.from("analyses").select("id, title").eq("id", analysis.parent_analysis_id).eq("user_id", user.id).single()` — only when `analysis.parent_analysis_id` is non-null. Renders as `<a href={"/analyses/" + parent.id}>"Continued from: " + parent.title</a>` above the page header (before the title `<h1>`).
- Children: `supabase.from("analyses").select("id, title, created_at").eq("parent_analysis_id", analysis.id).eq("user_id", user.id).order("created_at", { ascending: true })` — always run (returns empty array for root analyses). Renders a "Continued as:" section below the sources collapsible when `children.length > 0`. Each child is an `<a href={"/analyses/" + child.id}>{child.title}</a>` list item with the `created_at` date.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npm run build` completes without TypeScript errors

#### Manual Verification:

- A root analysis (no parent) shows no "Continued from" link and no "Continued as" section (clean detail page)
- After running a continuation, the **parent** detail page shows a "Continued as:" section listing the child with its title and date
- The **child** detail page shows "Continued from: <parent title>" as a link above the header
- Clicking "Continued from" navigates to the parent
- Clicking a child link in "Continued as:" navigates to that child
- Chain of depth 3 (A → B → C): B shows both "Continued from: A" and "Continued as: C"
- If a parent analysis is deleted (manually via Supabase Studio), the child's `parent_analysis_id` becomes NULL (ON DELETE SET NULL) and "Continued from" no longer renders — no broken link

---

## Testing Strategy

### Manual Testing Steps:

1. Start from an account with at least one saved analysis from S-01.
2. Open the analysis detail page — verify "Continue analysis" button is present.
3. Click "Continue analysis" — verify the form pre-fills with the parent's prompt, input, and title `"Continue: <original title>"`.
4. Change the prompt to a different one (or keep it), change the model if desired, optionally edit extra context.
5. Click Run — verify streaming starts, output reflects the parent analysis content as context (AI response should reference or build on the parent output).
6. On completion, click the "Saved — view analysis" link to the child.
7. Verify child detail page shows "Continued from: <parent title>" link above the header.
8. Click the "Continued from" link — verify it navigates to the parent.
9. On the parent detail page, verify "Continued as: <child title>" section is present and links to the child.
10. Run a second continuation from the child (depth-3 chain): verify the grandchild's detail page shows "Continued from: <child title>"; the child's detail page shows both "Continued from: <parent title>" and "Continued as: <grandchild title>".
11. Test error path: use the curl command from Phase 1 with a non-existent `parent_analysis_id` — verify SSE error `parent_not_found` is returned.
12. Test abort: start a continuation run, navigate away mid-stream — verify no console errors.

## References

- Roadmap S-02 definition: `context/foundation/roadmap.md:111-122`
- PRD FR-018, Business Logic #2: `context/foundation/prd.md:128-129,191`
- AI run endpoint: `src/pages/api/ai/run.ts`
- Run input validator: `src/lib/validation.ts:85`
- AI client interface: `src/lib/services/ai/index.ts:24-31`
- Schema migration (parent_analysis_id, traversal index): `supabase/migrations/20260529120000_data_schema_and_rls.sql:125,202`
- NewAnalysisForm (model for ContinueAnalysisForm): `src/components/NewAnalysisForm.tsx`
- New Analysis page (model for continue page): `src/pages/analyses/new.astro`
- Analysis detail page (button + chain display target): `src/pages/analyses/[id]/index.astro` (renamed from `[id].astro` in Phase 2 step 0)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API Context Composition

#### Automated

- [x] 1.1 `npm run lint` passes with no new errors — 08ff9b6
- [x] 1.2 `npm run build` completes without TypeScript errors — 08ff9b6

#### Manual

- [ ] 1.3 POST with valid parent_analysis_id runs and saves child with parent output as context
- [x] 1.4 POST with non-existent parent_analysis_id returns SSE error `parent_not_found`
- [x] 1.5 POST with parent_analysis_id from another user returns `parent_not_found`
- [x] 1.6 POST without parent_analysis_id (normal flow) still works unchanged

### Phase 2: Continue Page, Form, and Detail Button

#### Automated

- [x] 2.1 `npm run lint` passes with no new errors
- [x] 2.2 `npm run build` completes without TypeScript errors

#### Manual

- [x] 2.3 "Continue analysis" button visible on any analysis detail page
- [x] 2.4 Button navigates to `/analyses/<id>/continue`
- [x] 2.5 Continue form pre-fills correctly (prompt, model, analysis_type, input, title)
- [x] 2.6 All fields are editable
- [x] 2.7 Empty-prompts CTA shown when user has no prompts
- [x] 2.8 Missing API key alert shown and Run disabled when provider key absent
- [x] 2.9 Submitting valid continuation streams correctly; output reflects parent context
- [x] 2.10 "Saved — view analysis" link appears on completion pointing to child
- [x] 2.11 Child analysis has parent_analysis_id set (verify via Supabase Studio or Phase 3 chain display)
- [x] 2.12 Parent-not-found error shows inline error and unfreezes form
- [x] 2.13 Navigating away mid-stream aborts cleanly

### Phase 3: Chain Display on Detail Page

#### Automated

- [ ] 3.1 `npm run lint` passes with no new errors
- [ ] 3.2 `npm run build` completes without TypeScript errors

#### Manual

- [ ] 3.3 Root analysis detail page shows no "Continued from" link and no "Continued as" section
- [ ] 3.4 Parent detail page shows "Continued as:" section after continuation is run
- [ ] 3.5 Child detail page shows "Continued from: <parent title>" link above header
- [ ] 3.6 "Continued from" link navigates to parent
- [ ] 3.7 Child link in "Continued as:" navigates to child
- [ ] 3.8 Depth-3 chain: middle analysis shows both parent link and child link
- [ ] 3.9 Deleted parent: child's "Continued from" section disappears gracefully (no broken link)
