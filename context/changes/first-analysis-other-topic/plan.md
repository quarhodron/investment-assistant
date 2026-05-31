# S-01: First Analysis on a Free-Text "Other" Topic — Implementation Plan

## Overview

Build the first user-visible end-to-end slice: a signed-in user creates a prompt, runs an AI analysis on a free-text "other" topic, sees the result stream in, and can reopen the saved read-only result. This is the prerequisite for S-02 (continue-analysis chain), the north-star milestone.

## Current State Analysis

F-01 and F-02 are done. What exists:

- **Schema**: `prompts`, `analyses`, `user_settings`, `ai_models`, `watched_companies` — all live with RLS and immutability trigger on `analyses`.
- **AI endpoint**: `/api/ai/run.ts` fully implemented — validates input, decrypts API key, streams SSE (`delta` / `done` / `error` events), saves on `done`.
- **Settings**: `/settings` page with API key management and default model selector working end-to-end.
- **Auth**: Middleware, signin/signup/signout/confirm-email all live. `PROTECTED_ROUTES = ["/dashboard", "/settings"]` in `src/middleware.ts:4`.
- **Validation**: `validateRunInput()` in `src/lib/validation.ts:24` handles the full run payload including `prompt_id`, `prompt_body`, `prompt_name`, `input`, `title`, `analysis_type`, `extra_context`, `subject`.
- **Types**: `Prompt`, `Analysis`, `PromptInsert`, `AiModel`, `StoredSources`, `StreamEvent` all exported from `src/types.ts`.

What is missing: the four user-facing pages (`/prompts`, `/analyses/new`, `/analyses`, `/analyses/[id]`), the prompts API route, Topbar nav links, and empty-state CTA logic.

## Desired End State

A signed-in user with no prompts lands on `/analyses/new`, sees a CTA linking to `/prompts`. They create a prompt there. Back on `/analyses/new`, they select their prompt, pick a model, enter a topic, run the analysis, watch it stream inline, and see a "Saved" confirmation with a link to `/analyses/[id]`. The detail page shows the full result, collapsible sources, the "not investment advice" notice, and the prompt/model/input metadata. The saved analysis appears on `/analyses`. All four pages are accessible from Topbar links.

### Key Discoveries:

- `/api/ai/run.ts:148` emits `done` frame with `{ analysis_id, sources, usage, model, provider }` — the `analysis_id` is available immediately after save, usable for the "link to detail" CTA without a separate fetch.
- `validateRunInput` at `src/lib/validation.ts:24` requires `provider`, `model_id`, `prompt_body`, `prompt_name`, `input`, `title`, `analysis_type`. The `prompt_id` field is optional — the existing endpoint already handles it.
- `/api/ai/run.ts:102-108` passes `context: input.extra_context` to `runAiAnalysis` — the `context` param is the continuation/extra-context slot; for S-01 (no parent), it's used only for `extra_context`.
- `settings.astro:20-27` pattern for parallel Supabase queries in the frontmatter is the established page pattern.
- `StoredSources` is a discriminated union `{ provider: 'anthropic', items: [...] } | { provider: 'openai', items: [...] }` — the detail view must handle both shapes to render sources.
- The `analyses` table has no `title` editable after insert (immutable); `title` is set at run time — the New Analysis form must derive or accept a title.

## What We're NOT Doing

- No prompt edit or delete (S-04)
- No analyses list filtering/sorting (S-03)
- No "Continue analysis" (S-02)
- No watched company picker (company-type analysis is S-06)
- No dashboard recent-analyses panel (S-08)
- No automatic title generation via AI — user provides the title or it defaults to input text
- No markdown rendering of AI output — plain text with preserved newlines is sufficient for v1
- No token/cost display beyond persisting the values (FR-033 is nice-to-have)

## Implementation Approach

Ship in three phases, each independently verifiable before the next starts:

1. **Phase 1** — foundation wiring: prompts API + page + Topbar nav. Unlocks the user's ability to create a prompt before the analysis form exists.
2. **Phase 2** — core value: New Analysis form + SSE consumer React island. This is the slice's load-bearing phase; every PRD invariant (snapshot-on-save, api-key-guard, source-verbatim, abort-on-navigate) lands here.
3. **Phase 3** — read surface: Analyses list + detail view. Closes FR-015, FR-016, FR-032 and the "not investment advice" guardrail.

All three phases use the established Astro page pattern from `settings.astro`: server-side Supabase queries in frontmatter, props passed to React islands with `client:load`, POST-redirect-GET for mutations.

## Critical Implementation Details

**SSE consumer teardown**: The `NewAnalysisForm` island must create an `AbortController`, pass `signal` to `fetch('/api/ai/run', ...)`, and call `abort()` in the React `useEffect` cleanup. The `/api/ai/run.ts` stream uses `ReadableStream` — aborting the fetch will cause the `for await` loop inside the stream's `start()` to throw and exit via `finally { controller.close() }`. This is the intended abort path; no server-side changes are needed.

**`done` frame `analysis_id` availability**: The SSE `done` event (emitted at `/api/ai/run.ts:146`) carries `analysis_id`. The React island must capture this ID from the `done` frame to construct the `/analyses/[id]` link shown in the post-save confirmation. No secondary fetch is required.

**Prompt API route placement**: The prompts route follows the API-routes-are-uppercase-exports pattern (`export const POST: APIRoute`). Input validation (name 1–200 chars, body 1–50 000 chars, description optional) must mirror the schema constraints from `supabase/migrations/20260529120000_data_schema_and_rls.sql` without introducing a new validation library — use inline guards matching the pattern in `src/lib/validation.ts`.

---

## Phase 1: Prompts, Navigation, and Route Protection

### Overview

Add the Prompts page (list + create form) and its POST API route. Extend Topbar with nav links for Analyses, Prompts, and New Analysis. Add all four new routes to `PROTECTED_ROUTES`. After this phase, a user can create a prompt end-to-end and navigate to any new page (404 until Phase 2/3, but protected).

### Changes Required:

#### 1. Protected routes expansion

**File**: `src/middleware.ts`

**Intent**: Add `/prompts`, `/analyses` to `PROTECTED_ROUTES` so the middleware redirects unauthenticated users to sign-in before any new page is built.

**Contract**: Extend the `PROTECTED_ROUTES` array at line 4 to include `"/prompts"` and `"/analyses"`. The `startsWith` check at line 18 means a single `"/analyses"` entry covers `/analyses`, `/analyses/new`, and `/analyses/[id]`.

#### 2. Topbar navigation links

**Files**: `src/components/Topbar.astro`, `src/layouts/Layout.astro`

**Intent**: Add Analyses, Prompts, and New Analysis links to the authenticated nav bar, and include Topbar in the shared Layout so every page (new and existing) has navigation.

**Contract**: In `Topbar.astro`, authenticated branch (lines 9–18), add three `<a>` elements alongside the existing Dashboard link. Links: `href="/analyses"` (Analyses), `href="/prompts"` (Prompts), `href="/analyses/new"` (New Analysis). Use the existing `text-purple-300 transition-colors hover:text-purple-100 hover:underline` class pattern. In `Layout.astro`, import Topbar and render it at the top of `<body>` (before the `<slot />`). This gives dashboard, settings, and all new pages automatic navigation. The unauthenticated branch in Topbar already handles logged-out users correctly.

#### 3. Prompts API route — create

**File**: `src/pages/api/prompts/index.ts`

**Intent**: Handle `POST /api/prompts` to create a new prompt for the authenticated user. Validates input, inserts into `prompts` table, redirects back to `/prompts` with status.

**Contract**: `export const POST: APIRoute`. Checks `context.locals.user` (401 if absent). Checks `Origin` header for CSRF (same pattern as `src/pages/api/settings/api-keys.ts`). Reads form data: `name` (string, 1–200), `body` (string, 1–50000), `description` (string, optional, max 500). On success: `redirect("/prompts?ok=1")`; on error: `redirect("/prompts?error=<urlencoded>")`. Inserts `{ user_id, name, body, description }` into `prompts`; `created_at`/`updated_at` are DB-defaulted.

#### 4. Prompts page — list + create form

**File**: `src/pages/prompts.astro`

**Intent**: Display the user's prompts in a list and provide an inline create form. Shows empty-state message when no prompts exist.

**Contract**: Server-side: query `supabase.from("prompts").select("id, name, description, created_at").eq("user_id", user.id).order("name")`. Read `?error` and `?ok` URL params. Render list of prompt cards (name + description). Render a create form below the list (or at top when list is empty) with fields: `name`, `description` (optional), `body`. Form POSTs to `/api/prompts`. Show `?ok` success banner and `?error` error banner using the existing pattern from `settings.astro:51-65`. Empty-state: when no prompts, display a descriptive message with a CTA highlighting the form.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes with no new errors
- `npm run build` completes without TypeScript errors

#### Manual Verification:

- Unauthenticated visit to `/prompts` redirects to `/auth/signin`
- Authenticated user sees Topbar with Analyses, Prompts, New Analysis links
- Authenticated user on `/prompts` sees the create form
- Submitting the form with a valid name + body creates a prompt and shows the success banner
- The new prompt appears in the list on reload
- Submitting with an empty name shows an error banner
- Empty-state message is shown before the first prompt is created

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: New Analysis — Form, Streaming, and Save

### Overview

Build `src/pages/analyses/new.astro` + the `NewAnalysisForm.tsx` React island. The island handles all interactive state: prerequisite checks (prompts exist, API key configured for the selected provider), form input, SSE streaming display, error handling with form retained, and the post-save "Saved" confirmation with link to detail.

### Changes Required:

#### 1. New Analysis page shell

**File**: `src/pages/analyses/new.astro`

**Intent**: Server-side shell that fetches the data the React island needs (prompts list, models list, user settings), then mounts the island with `client:load`.

**Contract**: Parallel-query: `prompts` (id, name, description, body — body needed to send to API), `ai_models` (id, provider, display_name, is_default, sort_order; filter `enabled = true`, order `sort_order`), `user_settings` (api_keys — shape-checked to derive `{ anthropic: boolean, openai: boolean }` key-configured status, same logic as `settings.astro:30-34`), `user_settings.default_model`. Pass all as props to `<NewAnalysisForm ... client:load />`.

#### 2. NewAnalysisForm React island

**File**: `src/components/NewAnalysisForm.tsx`

**Intent**: The core interactive component for S-01. Manages the full lifecycle: empty-state → form fill → streaming → saved/error.

**Contract**: Props: `prompts: Prompt[]`, `models: AiModel[]`, `apiKeyStatus: { anthropic: boolean, openai: boolean }`, `defaultModelId: string | null`.

State machine (single `status` discriminant): `idle` → `streaming` → `saved | error`. The `idle` state renders the form; `streaming` renders the form frozen + live output panel; `saved` renders the form frozen + output + "Saved — view analysis" link; `error` renders the form (inputs restored/unfrozen) + inline error message.

**Form fields** (type=`other` only for S-01):
- Prompt selector: `<select>` populated from `prompts` prop; each option value = prompt `id`.
- Model selector: `<select>` grouped by provider; each option value = `model.id`; pre-selected from `defaultModelId` prop, falling back to first enabled model. When a provider has no configured API key (from `apiKeyStatus`), those options show as disabled with a "(no API key)" label.
- Topic / input: `<textarea>` — free-text topic (maps to `input` field in the run payload).
- Extra context: `<textarea>` optional — maps to `extra_context`.
- Title: `<input>` — auto-derived as the first 100 chars of the topic input (trimmed), editable.

**Empty-state CTAs**:
- When `prompts.length === 0`: show a "Create your first prompt" CTA block with link to `/prompts` instead of (or above) the prompt selector.
- When the selected model's provider has `apiKeyStatus[provider] === false`: show a "Configure your [Provider] API key in Settings" inline alert; disable the Run button.

**SSE consumer**:

```typescript
const abortRef = useRef<AbortController | null>(null);

async function handleRun() {
  const ac = new AbortController();
  abortRef.current = ac;
  setStatus('streaming');
  // ... fetch /api/ai/run with signal: ac.signal, stream reader loop
}

useEffect(() => () => abortRef.current?.abort(), []);
```

Read the stream with `response.body.getReader()`. **Buffered parse contract**: network chunking may split an SSE frame mid-line or combine multiple frames in one chunk. The consumer must accumulate decoded text in a `buffer` string (via `TextDecoder`), then split on `\n\n` to extract complete frames. Within each frame, extract the `event:` line and the `data:` line separately before dispatching. The server frame format is `event: <type>\ndata: <json>\n\n` (two lines before the blank separator). Dispatch on event type: On `delta`: JSON-parse data, append `data.delta` to `output` state. On `done`: JSON-parse data, extract `analysis_id`, set `status: 'saved'`. On `error`: JSON-parse data, extract `message`, set `status: 'error'`, unfreeze form.

**Analysis title derivation**: default the `title` field to the first 100 chars of the `input` textarea (trimmed, updated as the user types). User can override.

#### 3. Run payload construction

**Intent**: The `NewAnalysisForm` must send the exact payload shape `validateRunInput()` expects, including all required and optional fields.

**Contract** (payload sent to `POST /api/ai/run`):
```
{
  provider,          // from selected model's provider
  model_id,          // selected model id
  prompt_id,         // selected prompt id
  prompt_body,       // from prompts array (looked up by id)
  prompt_name,       // from prompts array
  prompt_description,// from prompts array (optional)
  input,             // topic textarea
  extra_context,     // extra context textarea (omit if empty)
  analysis_type: "other",
  subject,           // same as input for type=other (subject is the free-text topic)
  title,             // from title field
}
```

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` completes without TypeScript errors

#### Manual Verification:

- User with no prompts sees the "Create your first prompt" CTA on `/analyses/new`
- User with prompts but no API key sees the "Configure API key" alert and Run is disabled
- Form fills correctly: prompt selector, model selector (provider options disabled when no key), topic, extra context, title
- Clicking Run transitions to streaming state; AI output appears delta-by-delta
- Form inputs are frozen during streaming
- On successful completion: "Saved — view analysis" link appears, pointing to `/analyses/<id>`
- On provider error (e.g. wrong API key): inline error message shown, form unfrozen and filled
- Navigating away mid-stream (clicking a Topbar link) aborts the stream without console errors

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Analyses List and Read-Only Detail View

### Overview

Build `src/pages/analyses/index.astro` (analyses list, FR-015) and `src/pages/analyses/[id].astro` (read-only detail, FR-016, FR-032). Both are static Astro pages — no React islands needed.

### Changes Required:

#### 1. Analyses list page

**File**: `src/pages/analyses/index.astro`

**Intent**: Show all of the user's saved analyses in reverse-chronological order. Empty state when none exist.

**Contract**: Query `supabase.from("analyses").select("id, title, analysis_type, model, provider, created_at").eq("user_id", user.id).order("created_at", { ascending: false })`. Render as a list of cards/rows: title, type badge (other), model, date. Each card links to `/analyses/[id]`. Empty state: "No analyses yet — run your first one" with a CTA to `/analyses/new`.

#### 2. Analyses detail page

**File**: `src/pages/analyses/[id].astro`

**Intent**: Read-only view of a saved analysis. Shows AI output, prompt metadata, model/provider, input, extra context (if any), collapsible sources, and the "not investment advice" notice.

**Contract**: Query `supabase.from("analyses").select("*").eq("id", id).eq("user_id", user.id).single()` — the RLS `user_id` filter ensures a 404-equivalent if the analysis belongs to another user (`.single()` returns an error when no row is found). If `error` or `!data`: return `Astro.redirect("/analyses")`.

Layout sections:
- **Header**: title, `analysis_type` badge, timestamp, provider + model badge.
- **"Not investment advice" notice**: always visible, styled as an info banner using the existing `Banner.astro` component with `variant="info"`.
- **Prompt used**: collapsible section showing `prompt_name_snapshot`, `prompt_description_snapshot`, `prompt_body_snapshot`.
- **Input**: `input` field (and `extra_context` if not null).
- **AI output**: `<pre>` or whitespace-preserving `<div>` with full `output` text.
- **Sources**: collapsible `<details>/<summary>` section. When `sources` is non-null and has items, render the sources list. `StoredSources` is `{ provider: 'anthropic', items: Anthropic.CitationsWebSearchResultLocation[] } | { provider: 'openai', items: OpenAI.Responses.ResponseTextOutput.URLCitation[] }`. For both providers, render each item as a numbered list entry with the URL as a hyperlink and the title (if present). When sources is null or empty: show "No sources returned."

#### 3. Type-narrowing helper for StoredSources rendering

**File**: `src/lib/sources.ts`

**Intent**: Provide a provider-agnostic function that converts a `StoredSources` value into a flat array of `{ title: string | null, url: string }` objects, so the detail page doesn't branch on provider shape in template code.

**Contract**: `export function flattenSources(sources: StoredSources | null): { title: string | null; url: string }[]`. Returns `[]` for null input. For `provider: 'anthropic'`: map `item.url` (`string`) and `item.title ?? null` (`string | null` in the SDK type). For `provider: 'openai'`: map `item.url` (`string`) and `item.title ?? null` (`string` in the SDK type, widened to `string | null` in the return type). Both providers use the same field names `.url` and `.title`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` completes without TypeScript errors

#### Manual Verification:

- `/analyses` lists all saved analyses in reverse-chronological order
- Empty state is shown for a new account
- Clicking an analysis card opens `/analyses/[id]`
- Detail page shows: title, type, model/provider, input, output, prompt snapshot
- "Not investment advice" banner is visible on every detail page
- Sources section is present and collapsed by default; expanding it shows source URLs as hyperlinks
- "No sources returned" is shown when sources is empty
- Visiting `/analyses/<another-users-id>` redirects to `/analyses` (RLS enforcement)
- Analyses page is linked from the "Saved — view analysis" CTA on New Analysis page

---

## Testing Strategy

### Manual Testing Steps:

1. Start from a fresh account (no prompts, no API key).
2. Navigate to `/analyses/new` — verify "Create your first prompt" CTA is shown.
3. Follow CTA to `/prompts` — create a prompt (e.g. name: "Sector overview", body: "Give me a brief overview of the following sector or topic:").
4. Return to `/analyses/new` — prompt selector now shows the created prompt.
5. Without configuring an API key, select a model — verify "Configure API key" alert appears and Run is disabled.
6. Go to `/settings`, add an OpenAI API key (use `gpt-4o-mini` for cheapest test).
7. Return to `/analyses/new`, fill: topic = "renewable energy sector, May 2026", leave extra context blank, title auto-fills.
8. Click Run — verify streaming starts, output appears delta-by-delta, form is frozen.
9. Let run complete — verify "Saved — view analysis" link appears.
10. Click the link — verify detail page shows full output, metadata, and sources (collapsed).
11. Expand sources — verify URLs are rendered as links.
12. Navigate to `/analyses` — verify the saved analysis appears in the list.
13. Test early abort: start a run, click a Topbar link within the first second of streaming (before the run completes) — verify no errors in browser console and no partial/orphaned analysis saved. Note: if the server has already emitted the `done` frame before navigation, the analysis will be saved — this is correct behaviour (the analysis is complete), not a bug.
14. Test error path: temporarily use an invalid API key — verify inline error appears, form is unfrozen.

## References

- Roadmap S-01 definition: `context/foundation/roadmap.md:98-109`
- PRD FR-006–016, FR-020, FR-028–032: `context/foundation/prd.md`
- AI run endpoint: `src/pages/api/ai/run.ts`
- Run input validator: `src/lib/validation.ts:24`
- SSE event shapes: `src/lib/services/ai/index.ts`
- F-01 schema migration: `supabase/migrations/20260529120000_data_schema_and_rls.sql`
- Settings page pattern (parallel queries, error/ok params): `src/pages/settings.astro`
- Topbar pattern: `src/components/Topbar.astro`
- Middleware protected routes: `src/middleware.ts:4`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Prompts, Navigation, and Route Protection

#### Automated

- [x] 1.1 `npm run lint` passes with no new errors — 3c1a262
- [x] 1.2 `npm run build` completes without TypeScript errors — 3c1a262

#### Manual

- [ ] 1.3 Unauthenticated visit to `/prompts` redirects to `/auth/signin`
- [ ] 1.4 Authenticated user sees Topbar with Analyses, Prompts, New Analysis links
- [ ] 1.5 Authenticated user on `/prompts` sees the create form
- [ ] 1.6 Submitting the form with a valid name + body creates a prompt and shows the success banner
- [ ] 1.7 The new prompt appears in the list on reload
- [ ] 1.8 Submitting with an empty name shows an error banner
- [ ] 1.9 Empty-state message is shown before the first prompt is created

### Phase 2: New Analysis — Form, Streaming, and Save

#### Automated

- [x] 2.1 `npm run lint` passes — 7da71cc
- [x] 2.2 `npm run build` completes without TypeScript errors — 7da71cc

#### Manual

- [x] 2.3 User with no prompts sees the "Create your first prompt" CTA on `/analyses/new` — 7da71cc
- [x] 2.4 User with prompts but no API key sees the "Configure API key" alert and Run is disabled — 7da71cc
- [x] 2.5 Form fills correctly: prompt selector, model selector (provider options disabled when no key), topic, extra context, title — 7da71cc
- [x] 2.6 Clicking Run transitions to streaming state; AI output appears delta-by-delta — 7da71cc
- [x] 2.7 Form inputs are frozen during streaming — 7da71cc
- [x] 2.8 On successful completion: "Saved — view analysis" link appears, pointing to `/analyses/<id>` — 7da71cc
- [x] 2.9 On provider error (e.g. wrong API key): inline error message shown, form unfrozen and filled — 7da71cc
- [x] 2.10 Navigating away mid-stream aborts the stream without console errors — 7da71cc

### Phase 3: Analyses List and Read-Only Detail View

#### Automated

- [x] 3.1 `npm run lint` passes — a591895
- [x] 3.2 `npm run build` completes without TypeScript errors — a591895

#### Manual

- [x] 3.3 `/analyses` lists all saved analyses in reverse-chronological order — a591895
- [x] 3.4 Empty state is shown for a new account — a591895
- [x] 3.5 Clicking an analysis card opens `/analyses/[id]` — a591895
- [x] 3.6 Detail page shows: title, type, model/provider, input, output, prompt snapshot — a591895
- [x] 3.7 "Not investment advice" banner is visible on every detail page — a591895
- [x] 3.8 Sources section is present and collapsed by default; expanding it shows source URLs as hyperlinks — a591895
- [x] 3.9 "No sources returned" is shown when sources is empty — a591895
- [x] 3.10 Visiting `/analyses/<another-users-id>` redirects to `/analyses` (RLS enforcement) — a591895
- [x] 3.11 Analyses page is linked from the "Saved — view analysis" CTA on New Analysis page — a591895
