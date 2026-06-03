# Prompts Management — Plan Brief

> Full plan: `context/changes/prompts-management/plan.md`

## What & Why

Add edit and delete to the Prompts page (FR-008, FR-009). Users need to maintain their prompt library — rename prompts, fix bodies, remove ones they no longer use — without those changes affecting past analyses (snapshot invariant already enforced structurally).

## Starting Point

`src/pages/prompts.astro` already renders a list of prompts and a create form. The `prompts` table has RLS UPDATE + DELETE policies and an `updated_at` trigger. The only API route is `POST /api/prompts` (create). No edit/delete affordances exist in the UI.

## Desired End State

Each prompt card shows an Edit link (navigates to a pre-filled `/prompts/[id]/edit` page) and a Delete button (inline toggle confirms before submitting). Submitting the edit form updates the row and returns "Prompt saved." Confirming delete removes the row and returns to `/prompts` with "Prompt deleted." Saved analyses continue to display the snapshot text from when they were run.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Edit UI shape | Separate Astro page `/prompts/[id]/edit` | Fits the Astro-first SSR pattern; no React needed; consistent with the create flow |
| Delete confirmation | Inline toggle (no modal) | App has zero modal dialogs; mirrors the `replacing` toggle pattern in `ApiKeyCard` |
| API route structure | Single `[id].ts`, `action` param | Mirrors `api/settings/api-keys.ts` exactly; one place for auth + ownership guard |

## Scope

**In scope:** Edit (name, description, body) and delete any owned prompt; inline delete confirmation; "Prompt deleted." banner; pre-filled edit page with success/error banners.

**Out of scope:** Modal dialogs, soft-delete/undo, cascade-deleting analyses, React prompts list component.

## Architecture / Approach

Pure SSR Astro + form POST throughout. New file `api/prompts/[id].ts` handles both mutations — `action=delete` branches to delete, default branches to update. New page `src/pages/prompts/[id]/edit.astro` renders the pre-filled form. Updated `prompts.astro` adds an Edit link and a vanilla-JS `<script>` tag for the delete confirmation toggle.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API endpoint | `POST /api/prompts/[id]` — update + delete with ownership guard | Cross-user id must not mutate foreign rows |
| 2. Edit page + list UI | `/prompts/[id]/edit` page + edit/delete affordances on cards | Inline JS toggle must reset correctly; snapshot invariant must hold |

**Prerequisites:** S-01 done (prompts table live, create flow working). No schema migration needed.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Snapshot invariant is assumed to be structural (analyses store `prompt_*_snapshot` columns). Verify during Phase 2 manual testing that editing/deleting a prompt does not alter a saved analysis display.

## Success Criteria (Summary)

- User can edit any prompt and see "Prompt saved." with the new values reflected in the list
- User can delete any prompt and see "Prompt deleted." with the row gone from the list
- A saved analysis run against the prompt before edit/delete still renders the original snapshot text
