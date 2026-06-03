# Prompts Management — Edit and Delete

## Context

S-04 from the roadmap: expose FR-008 (edit prompt) and FR-009 (delete prompt) so users can maintain their prompt library over time. The snapshot invariant — prior analyses retain the exact prompt text used at run time — is already enforced structurally in the analyses table (`prompt_name_snapshot`, `prompt_body_snapshot`, `prompt_description_snapshot`). This slice only adds the mutation surface; no schema work is needed.

## Current State Analysis

- `src/pages/prompts.astro` — list + create form (pure Astro SSR); no edit/delete affordances on prompt cards
- `src/pages/api/prompts/index.ts` — POST (create) only
- `supabase/migrations/20260529120000_data_schema_and_rls.sql` — `prompts` table already has RLS UPDATE + DELETE policies and an `updated_at` trigger; no migration required
- `src/types.ts` — `PromptUpdate` type already exists
- Closest pattern to follow: `src/pages/api/settings/api-keys.ts` — single POST handler, `action` param discriminates between remove vs save

## Desired End State

From the Prompts page a signed-in user can:

- Click "Edit" on any prompt → land on `/prompts/[id]/edit` with a pre-filled form; submit saves changes and returns to the edit page with a "Prompt saved." banner
- Click "Delete" on any prompt → confirm inline (without a modal); confirmed delete removes the row and redirects to `/prompts?ok=deleted`

Prior analyses are unaffected — their snapshots are independent of the `prompts` row.

### Key Discoveries

- `src/pages/api/settings/api-keys.ts:29-32` — `action` param pattern to replicate in `[id].ts`
- `src/pages/api/prompts/index.ts:31-38` — validation rules (same constraints apply to update)
- `src/layouts/Layout.astro:43-50` — precedent for a `<script>` tag inside an Astro page (URL cleanup); confirms vanilla JS scripts are acceptable for simple interactivity without React
- No shadcn Dialog/modal exists in the app; keeping zero-modal policy

## What We're NOT Doing

- No modal confirmation dialogs
- No soft-delete / undo
- No cascading deletion of analyses (FR-009: analyses are preserved)
- No React component for the prompts list (vanilla JS toggle is sufficient)

## Implementation Approach

Two phases: (1) API handler for update + delete, (2) edit page + list UI additions. Pure SSR Astro + form POST throughout — no new patterns introduced.

---

## Phase 1: API endpoint — update and delete

### Overview

New `src/pages/api/prompts/[id].ts` handles both mutations on a single prompt row. One file, one POST handler, `action` param discriminates — mirrors `api/settings/api-keys.ts`.

### Changes Required

#### 1. New file: `src/pages/api/prompts/[id].ts`

**Intent**: POST handler that updates or deletes a prompt owned by the authenticated user. Enforces CSRF origin check, auth, and explicit `.eq("user_id", user.id)` ownership guard on every Supabase call (defence-in-depth on top of RLS).

**Contract**:

- `action=delete` — `.delete().eq("id", id).eq("user_id", user.id)` → redirect `/prompts?ok=deleted`
- default (update) — validate name/body/description with the same rules as `index.ts:31-38` → `.update({name, body, description}).eq("id", id).eq("user_id", user.id)` → redirect `/prompts/[id]/edit?ok=1` on success, `/prompts/[id]/edit?error=<msg>` on failure
- `id` comes from `context.params.id`; treat a missing/invalid id the same as auth failure → redirect `/prompts`

### Success Criteria

#### Automated Verification

- Lint and type check pass: `npm run lint`

#### Manual Verification

- In-browser: POST to `/api/prompts/[id]` with `action=delete` deletes the row; redirect lands on `/prompts?ok=deleted`
- In-browser: POST to `/api/prompts/[id]` with valid update fields updates the row; redirect lands on `/prompts/[id]/edit?ok=1`
- Sending another user's prompt id → row not mutated (RLS + explicit `.eq("user_id")` guard)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to Phase 2.

---

## Phase 2: Edit page and list UI additions

### Overview

New Astro SSR page `/prompts/[id]/edit` with a pre-filled form + updated `prompts.astro` adding Edit link and Delete form with inline confirmation toggle per prompt card.

### Changes Required

#### 1. New file: `src/pages/prompts/[id]/edit.astro`

**Intent**: Pre-filled edit form for a single prompt. Fetches the prompt by `id` at request time (RLS auto-enforces ownership), shows `?ok` / `?error` banners, and provides a Cancel link back to `/prompts`.

**Contract**:

- If Supabase returns null for the prompt id (not found or not owned), redirect to `/prompts`
- Form fields: name (text, maxlength=200, required), description (text, maxlength=500, optional), body (textarea, maxlength=50000, required) — all pre-filled from the fetched row
- Form `method="POST" action="/api/prompts/[id]"`, no explicit `action` hidden input (update is the default)
- `ok=1` → "Prompt saved." success banner; `error` → error banner — same CSS classes as the banners in `prompts.astro:35-47`
- Field styles: match `prompts.astro` create form exactly (same `class` strings on inputs and textarea)

#### 2. Updated file: `src/pages/prompts.astro`

**Intent**: Add Edit link and Delete affordance to each prompt card; show "Prompt deleted." when `?ok=deleted` is present.

**Contract**:

- Each card gets `data-prompt-row` attribute; inside: Edit link (`href="/prompts/[id]/edit"`) + a delete group with `data-delete-initial` (shows "Delete" button with `data-confirm-delete`) and `data-delete-confirm` (initially `hidden`, shows "Confirm delete" form + "Cancel" button with `data-delete-cancel`)
- Delete form: `method="POST" action="/api/prompts/[id]"`, hidden input `name="action" value="delete"`
- `<script>` tag in the page wires the toggle — `data-confirm-delete` click hides initial group and unhides confirm group; `data-delete-cancel` click reverses it. Astro processes `<script>` tags after DOM is ready, so no `DOMContentLoaded` wrapper is needed.
- `ok=deleted` → "Prompt deleted." banner (same style as existing `ok=1` banner); `ok=1` banner text stays "Prompt created successfully."

### Success Criteria

#### Automated Verification

- Lint and type check pass: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Navigate to `/prompts/[id]/edit` — form pre-filled with prompt's current name/description/body
- Edit a field, submit → edit page reloads with "Prompt saved." banner; value updated in Supabase
- Navigate to `/prompts` → each card shows Edit link and Delete button
- Click Delete on a card → "Confirm delete" + "Cancel" appear; clicking Cancel returns to original state
- Confirm delete → `/prompts?ok=deleted` with "Prompt deleted." banner; row absent from list
- Open a saved analysis that used the edited/deleted prompt → snapshot text still shown unchanged (analyses are immutable)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Manual Testing Steps

1. Create a test prompt, note its id from the URL on the edit page
2. Edit name + body → confirm "Prompt saved." and values updated in the list
3. Run a new analysis using the prompt, save it
4. Edit the prompt again → open the saved analysis → confirm it still shows the old prompt text (snapshot)
5. Delete the prompt → confirm "Prompt deleted." and it's gone from the list
6. Open the saved analysis again → confirm it still renders (analyses are preserved)

## References

- Roadmap entry: `context/foundation/roadmap.md` — S-04
- PRD: `context/foundation/prd.md` — FR-008, FR-009
- API key action pattern: `src/pages/api/settings/api-keys.ts:29-32`
- Validation rules to replicate: `src/pages/api/prompts/index.ts:31-38`
- Script tag precedent: `src/layouts/Layout.astro:43-50`

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API endpoint — update and delete

#### Automated

- [x] 1.1 Lint and type check pass: `npm run lint` — f475c59

#### Manual

- [x] 1.2 DELETE action deletes row and redirects to `/prompts?ok=deleted`
- [x] 1.3 UPDATE action updates row and redirects to `/prompts/[id]/edit?ok=1`
- [x] 1.4 Cross-user prompt id → row not mutated

### Phase 2: Edit page and list UI additions

#### Automated

- [x] 2.1 Lint and type check pass: `npm run lint` — 310d202
- [x] 2.2 Build passes: `npm run build` — 310d202

#### Manual

- [x] 2.3 Edit page pre-fills fields and shows "Prompt saved." on submit
- [x] 2.4 Delete toggle shows confirm/cancel and resets on cancel
- [x] 2.5 Confirmed delete removes row and shows "Prompt deleted." banner
- [x] 2.6 Saved analysis retains prompt snapshot after prompt edit/delete
