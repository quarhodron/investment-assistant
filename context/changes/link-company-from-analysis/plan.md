# Link company from analysis (S-07) Implementation Plan

## Overview

Add two filing affordances to the analysis detail view so a user can associate any analysis with a watched company without leaving the page:

1. **Add to watchlist** (FR-019) — manually type every watchlist field; on save a new `watched_companies` row is created **and** the originating analysis is filed under it (`company_id` set). No AI-prose parsing.
2. **Link to watched company** (FR-019b / FR-020) — a picker of the user's existing watched companies sets `company_id`; an explicit **Unlink** action clears it back to null. Available on every analysis regardless of how it was run.

Both flows are surfaced through the app's **first shadcn `Dialog`**, driven by a small React island mounted on the detail view.

## Current State Analysis

- **The detail view is pure Astro SSR** (`src/pages/analyses/[id]/index.astro`). The only React island today is `MarkdownOutput`. The view already displays the linked company name in the masthead eyebrow (lines 81–87) and loads it via a `Promise.all` company lookup (lines 43–46), but there is **no affordance to set, change, or clear** `company_id`.
- **`company_id` is only writable at creation time** via `POST /api/ai/run` (`src/pages/api/ai/run.ts:170`). **No UPDATE route exists** for an existing analysis.
- **No schema work is needed.** `analyses.company_id` is `uuid NULL REFERENCES watched_companies(id) ON DELETE SET NULL` (`supabase/migrations/20260529120000_data_schema_and_rls.sql:126`). The old `analyses_type_company_check` constraint that gated `company_id` on `analysis_type` was **dropped** in `20260602000000_drop_analysis_type.sql`, so `company_id` is now freely mutable. The `analyses_update` RLS policy (`USING/WITH CHECK auth.uid() = user_id`) already exists (`…_data_schema_and_rls.sql:158-160`).
- **Watchlist create** is `POST /api/watchlist` (`src/pages/api/watchlist/index.ts`). It accepts **FormData** and responds with a **302 redirect** (`?ok=1` / `?error=…&_field=…`). It already validates all fields and handles the `(user_id, exchange, ticker)` unique constraint (`23505`) at line 89.
- **Company-picker precedent**: S-06 used a native `<select>` embedded in `NewAnalysisForm.tsx` (lines 306–341) with `companyLabel()` = `ticker ? "Name (TICKER)" : "Name"`. Companies are fetched SSR-side and passed as props.
- **No Dialog/Modal exists** anywhere; `radix-ui` is a dependency but no Dialog primitive is wrapped. `src/components/ui/` has `button`, `card`, `input`, `label`, `select`.
- **Conventions**: every write chains `.eq("user_id", user.id)`; FK references degrade gracefully to null; React→API uses `fetch` + JSON with a `Status` state machine; Vitest integration tests stub Supabase at the module boundary via `tests/integration/_harness/`.

### Key Discoveries:

- `analyses.company_id` is already mutable — no migration, no constraint to remove (`20260602000000_drop_analysis_type.sql:7`).
- `analyses_update` RLS policy is in place (`20260529120000_data_schema_and_rls.sql:158-160`).
- `POST /api/watchlist` redirects and returns no body — a Dialog island needs the created company's `id`, so the route needs a JSON content-negotiation branch (`src/pages/api/watchlist/index.ts:79-97`).
- `23505` duplicate handling already lives in the watchlist route (`src/pages/api/watchlist/index.ts:89`).
- Reusable test harness: `buildApiContext`, `createSupabaseStub`, `parseSseFrames` under `tests/integration/_harness/`.
- Detail view loads the linked company name at `[id]/index.astro:43-48` — the island needs current `company_id` + name and the full company list passed as SSR props.

## Desired End State

On any analysis detail view, the user sees two clearly distinct buttons. "Add to watchlist" opens a dialog with the full watchlist field set; on save, a new company is created and this analysis is filed under it. "Link to watched company" opens a dialog with a picker of existing companies plus, when a link already exists, an "Unlink" control. After either action the detail view reflects the new linked-company state. Linking enforces ownership (a user can never link to another user's company) and clearing sets `company_id` back to null.

Verification: pick an analysis with `company_id IS NULL`, use each flow, confirm the masthead company name appears/changes/disappears accordingly and the `analyses` row's `company_id` matches in Studio.

## What We're NOT Doing

- **No schema migration** — `company_id` already exists and is mutable.
- **No AI / prompt involvement** — `company_id` is filing metadata only (Business Logic #3); the AI never sees the watchlist row. No re-run, no prompt change.
- **No changes to continue-analysis link inheritance** — continuations still inherit the parent's `company_id` (S-06 behavior); re-filing a chain member is done per-analysis via these affordances, not by changing inheritance.
- **No editing of an existing watched company's fields** from this view — that stays on the watchlist edit page. "Add to watchlist" only creates; "Link" only sets/clears `company_id`.
- **No bulk / multi-analysis filing.**
- **No Playwright E2E** for these flows in this slice (no E2E harness wired for this area; manual verification covers the UX).
- **No auto-linking on duplicate** — a duplicate company surfaces an error pointing the user to "Link" (see Phase 1).

## Implementation Approach

Backend first: add the single mutation route that all link/change/clear operations use (`PATCH /api/analyses/[id]`), and teach `POST /api/watchlist` to return JSON when asked, so the "Add" dialog can retrieve the new company's id and then call the link route. Then build the UI: install shadcn `Dialog`, write one React island hosting both flows, and mount it on the detail view with SSR-provided props (company list + current link). The "Add" flow is a two-request client orchestration (create company → link), with the partial-failure state (company created but link failed) self-healing via the "Link" flow.

## Critical Implementation Details

- **Two-write atomicity (Add flow)**: company creation and back-linking are two separate requests with no DB transaction. If the link step fails after the company was created, the company still exists and the analysis is simply unlinked — the user can complete it via "Link". The dialog must report this state rather than implying nothing happened.
- **Ownership on link**: `PATCH /api/analyses/[id]` must verify the target `company_id` belongs to the current user before writing (mirror the `ai/run.ts:127-137` ownership check). A non-owned or non-existent `company_id` is rejected (not silently coerced) so the user gets clear feedback; `null` is always accepted (clear).
- **Detail view refresh**: after a successful action the simplest correct refresh is a full reload of the detail page (so the SSR masthead re-renders the company name). Avoid duplicating the company-name rendering in the island.

## Phase 1: Backend — link/unlink endpoint + watchlist JSON mode

### Overview

Introduce the first `analyses` mutation route and make watchlist-create usable from a JSON client, with Vitest coverage for the risky server logic.

### Changes Required:

#### 1. Analysis link/unlink endpoint

**File**: `src/pages/api/analyses/[id].ts` (new)

**Intent**: Set, change, or clear the `company_id` on one of the user's analyses. This is the single endpoint behind the picker, the "change company" case, and "Unlink".

**Contract**: `export const PATCH: APIRoute`. Request body JSON `{ company_id: string | null }`. Behavior:

- Auth: 401 JSON if `!context.locals.user`; Origin check consistent with other mutation routes.
- If `company_id` is a non-empty string: verify the company exists and is owned — `from("watched_companies").select("id").eq("id", company_id).eq("user_id", user.id).maybeSingle()`; if not found → 404/422 JSON error (rejected, not coerced).
- Update: `from("analyses").update({ company_id }).eq("id", id).eq("user_id", user.id).select("id").single()`. If no row → 404 JSON.
- `company_id: null` is always valid (clear).
- Success → JSON `{ ok: true, company_id }`, 200. Errors → JSON `{ error: <code|message> }` with appropriate status. (Use `application/json`, not redirects — this route only serves the island.)

#### 2. JSON mode for watchlist create

**File**: `src/pages/api/watchlist/index.ts`

**Intent**: Let the "Add to watchlist" dialog create a company via fetch and receive the new row's `id`, without disturbing the existing Astro-form callers that rely on the 302 redirect.

**Contract**: Branch on content negotiation — if the request `Content-Type` is `application/json` (or `Accept: application/json`), parse a JSON body of the same fields (`name`, `ticker`, `exchange`, `industry`, `note`), run the **same validation** already in the file (extract the validation + normalization into a shared helper so both branches share it), and:

- success → `200 application/json { id, name, ticker, exchange, industry, note }`;
- validation error → `400 { error }`;
- `23505` duplicate → `409 { error: "duplicate", message: "You already track this company — use Link to watched company instead." }`.
  FormData callers keep the existing redirect behavior untouched. Keep the Origin check applying to both branches.

#### 3. Vitest coverage

**File**: `tests/integration/api/analyses/id.patch.test.ts` (new) and `tests/integration/api/watchlist/create.json.test.ts` (new)

**Intent**: Guard the first analyses-mutation route and the new JSON branch where bugs are costly.

**Contract**: Reuse `tests/integration/_harness/` (`buildApiContext`, `createSupabaseStub`). Cases:

- PATCH: sets `company_id` for an owned company; rejects a `company_id` not owned by the user (no update issued); clears with `null`; 404 when the analysis id isn't the user's; 401 when unauthenticated.
- Watchlist JSON: returns `{ id, … }` on success; `400` on invalid name / ticker-exchange-together violation; `409` on simulated `23505`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- New endpoint tests pass: `npm test`
- `npx astro sync` then build succeeds: `npm run build`

#### Manual Verification:

- In browser devtools console on a detail view, `fetch("/api/analyses/<id>", {method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({company_id: "<owned-company-id>"})}).then(r=>r.json())` returns `{ok:true,...}` and the row updates in Studio.
- The same call with another user's company id is rejected; with `{company_id: null}` clears the link.
- `fetch("/api/watchlist", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({name:"Test Co"})}).then(r=>r.json())` returns a new `{id,...}`; the existing Astro watchlist add-form still works and still redirects.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: UI — shadcn Dialog + detail-view React island

### Overview

Install the app's first Dialog primitive and build a single React island that hosts both flows, wired to the Phase 1 endpoints.

### Changes Required:

#### 1. shadcn Dialog

**File**: `src/components/ui/dialog.tsx` (new)

**Intent**: Provide the overlay/modal primitive the two flows render into.

**Contract**: Install via `npx shadcn@latest add dialog` (new-york style, matches existing `src/components/ui/`). No `"use client"` directive (project convention). Verify it composes with the existing `button`/`input`/`label`/`select` components.

#### 2. Link-company island

**File**: `src/components/LinkCompanyControls.tsx` (new)

**Intent**: Render the two buttons and both dialogs; orchestrate the fetches; reflect success/error.

**Contract**: Props `{ analysisId: string; currentCompanyId: string | null; companies: Pick<WatchedCompany, "id" | "name" | "ticker">[] }`.

- Reuse `companyLabel()` from `NewAnalysisForm.tsx` (extract to a shared util, e.g. `src/lib/company.ts`, and import in both) — do not duplicate.
- **"Link to watched company"** dialog: native `<select>` (matching `NewAnalysisForm` styling) preselected to `currentCompanyId`; a "Link"/"Save" action `PATCH`es `{company_id}`; when `currentCompanyId` is set, an **"Unlink"** action `PATCH`es `{company_id: null}`. Empty-state message when `companies.length === 0` (link to `/watchlist`).
- **"Add to watchlist"** dialog: the full watchlist field set (`name` required; `ticker`/`exchange` together; `industry`; `note`) mirroring `watchlist.astro` constraints. On submit: `POST /api/watchlist` (JSON) → on success take returned `id` → `PATCH /api/analyses/[id]` `{company_id: id}`. Surface the `409` duplicate as "use Link to watched company instead". If create succeeds but link fails, report it explicitly (company created, not yet linked).
- `Status` state machine (`idle | submitting | error`) per the `NewAnalysisForm` pattern; on success, reload the detail view (`window.location.reload()`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Both dialogs open, trap focus, and close on Escape / overlay click.
- "Link" picker preselects the current company; "Unlink" appears only when a link exists.
- "Add to watchlist" with a fresh company creates + links; with a duplicate ticker/exchange shows the "use Link instead" message.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Detail-view integration + polish

### Overview

Mount the island on the detail view, pass the SSR props, and finish empty/error states and visual distinction between the two affordances.

### Changes Required:

#### 1. Mount the island and supply props

**File**: `src/pages/analyses/[id]/index.astro`

**Intent**: Place the two affordances near the masthead actions and feed the island the company list + current link.

**Contract**: Extend the existing `Promise.all` (lines 27–46) to also fetch the user's companies (`from("watched_companies").select("id, name, ticker").eq("user_id", user.id).order("name")`). Render `<LinkCompanyControls analysisId={analysis.id} currentCompanyId={analysis.company_id} companies={companies} client:load />` in the masthead action area (near the "Continue analysis →" CTA, lines 92–99). The two buttons must be visually distinct so "Link" is not mistaken for "Add" (per the roadmap S-07 UX risk).

#### 2. Visual / copy polish

**File**: `src/components/LinkCompanyControls.tsx`

**Intent**: Distinguish the two actions and keep feedback consistent with the app's inline style.

**Contract**: Distinct button treatment/labels ("Add to watchlist" = create; "Link to watched company" = file under existing). Error/success feedback rendered inline within the dialog (the app has no toast system). When `company_id` is already set, the masthead already shows the name (SSR) — the controls just offer change/unlink.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- On an analysis with `company_id IS NULL`: "Add to watchlist" creates + back-links; masthead now shows the company after reload.
- "Link to watched company" sets the link; choosing a different company changes it; "Unlink" clears it (masthead name disappears).
- With no watched companies, the Link dialog shows the empty-state CTA to `/watchlist`.
- The two affordances are visually distinct and not confusable.
- No regression: the existing watchlist add-form and analysis continue flow still work.

**Implementation Note**: After automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit / Integration Tests (Vitest):

- `PATCH /api/analyses/[id]`: set / change / clear `company_id`; reject non-owned company; 404 on foreign analysis; 401 unauthenticated.
- `POST /api/watchlist` JSON mode: returns `{id,…}` on success; `400` on validation failure; `409` on `23505`; FormData branch still redirects.

### Manual Testing Steps:

1. Open an analysis whose `company_id` is null. Click "Add to watchlist", fill name + ticker + exchange, save → verify masthead shows the company and Studio shows the new `watched_companies` row with the analysis `company_id` set.
2. On another null analysis, click "Link to watched company", pick an existing company, save → verify link set. Re-open, pick a different company → verify change. Click "Unlink" → verify masthead name disappears and `company_id` is null in Studio.
3. "Add to watchlist" with a ticker/exchange you already track → verify the "use Link instead" message and that no duplicate row is created.
4. With zero watched companies, open the Link dialog → verify empty-state CTA.

## Performance Considerations

Negligible. One extra SSR query (companies list) on the detail view — small per-user table, already indexed by `user_id`. No new client polling.

## Migration Notes

None — no schema change. `company_id` is already nullable, FK-constrained, and covered by `analyses_update` RLS.

## References

- Roadmap S-07: `context/foundation/roadmap.md:170-181`
- PRD FR-019 / FR-019b / FR-020: `context/foundation/prd.md:126-130`
- Detail view: `src/pages/analyses/[id]/index.astro`
- Watchlist create route: `src/pages/api/watchlist/index.ts`
- Company-picker precedent (S-06): `src/components/NewAnalysisForm.tsx:14-16,305-341`
- Schema + RLS: `supabase/migrations/20260529120000_data_schema_and_rls.sql:120-165`
- Constraint drop: `supabase/migrations/20260602000000_drop_analysis_type.sql`
- Test harness: `tests/integration/_harness/`
- Lessons (manual steps as in-browser `fetch`, pl-PL locale): `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — link/unlink endpoint + watchlist JSON mode

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — d505d7c
- [x] 1.2 Linting passes: `npm run lint` — d505d7c
- [x] 1.3 New endpoint tests pass: `npm test` — d505d7c
- [x] 1.4 `npx astro sync` then build succeeds: `npm run build` — d505d7c

#### Manual

- [x] 1.5 PATCH sets `company_id` for an owned company (browser fetch + Studio)
- [x] 1.6 PATCH rejects a non-owned company id and clears with `{company_id: null}`
- [x] 1.7 Watchlist JSON POST returns new `{id,…}`; existing Astro add-form still redirects

### Phase 2: UI — shadcn Dialog + detail-view React island

#### Automated

- [x] 2.1 Type checking passes: `npm run typecheck` — 3b7de0e
- [x] 2.2 Linting passes: `npm run lint` — 3b7de0e
- [x] 2.3 Build succeeds: `npm run build` — 3b7de0e

#### Manual

- [ ] 2.4 Both dialogs open, trap focus, close on Escape / overlay click
- [ ] 2.5 Link picker preselects current company; Unlink shows only when a link exists
- [ ] 2.6 Add-to-watchlist creates + links; duplicate shows "use Link instead"

### Phase 3: Detail-view integration + polish

#### Automated

- [x] 3.1 Type checking passes: `npm run typecheck`
- [x] 3.2 Linting passes: `npm run lint`
- [x] 3.3 Build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Add-to-watchlist back-links and masthead shows company after reload
- [ ] 3.5 Link set / change / unlink all reflect in the masthead and Studio
- [ ] 3.6 Empty-state CTA shows when no watched companies exist
- [ ] 3.7 Two affordances visually distinct; no regression in watchlist add / continue flow
