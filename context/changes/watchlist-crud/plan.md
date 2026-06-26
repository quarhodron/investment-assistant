# Watchlist CRUD Implementation Plan

## Overview

Build the application layer for **watched companies** — add, list, edit, and delete — plus surface the linked company name on the analyses views. The data layer (`watched_companies` table, per-user RLS, and the `analyses.company_id … ON DELETE SET NULL` foreign key that preserves tied analyses) already exists, so this slice is purely API routes, Astro pages, and small additions to the existing analyses views. It closely mirrors the existing `prompts` CRUD feature.

## Current State Analysis

- **`watched_companies` table already exists** — `supabase/migrations/20260529120000_data_schema_and_rls.sql:49-88`. Columns: `id`, `user_id`, `name` (NOT NULL, length 1–200), `ticker`, `exchange`, `industry`, `note`, `created_at`, `updated_at` (with the shared `updated_at` trigger). Full per-user RLS policies for SELECT/INSERT/UPDATE/DELETE granted to `authenticated` only.
- **Two DB constraints matter for the form/API:**
  - `CONSTRAINT ticker_exchange_together CHECK ((ticker IS NULL) = (exchange IS NULL))` — ticker and exchange must both be set or both be null.
  - `UNIQUE INDEX watched_companies_user_exchange_ticker_uidx ON (user_id, exchange, ticker) WHERE ticker IS NOT NULL` — a user cannot track the same ticker on the same exchange twice.
  - `INDEX watched_companies_user_name_idx ON (user_id, name)` — supports listing ordered by name.
- **FR-027 "preserve tied analyses on delete" is already enforced at the schema level** — `analyses.company_id uuid REFERENCES watched_companies(id) ON DELETE SET NULL` (`:126`). Deleting a company sets `company_id = NULL` on its analyses; no rows are lost. **No migration is needed in this slice.**
- **Types already exported** — `src/types.ts:11-13`: `WatchedCompany`, `WatchedCompanyInsert`, `WatchedCompanyUpdate`.
- **Canonical CRUD pattern is `prompts`** — clone its shape:
  - List + create: `src/pages/prompts.astro` (server-fetch in frontmatter, `?ok`/`?error` banners, inline two-step delete confirm with a small `<script>`).
  - Edit: `src/pages/prompts/[id]/edit.astro` (fetch one row with `.eq("user_id", user.id).single()`, redirect to list if not found).
  - API create: `src/pages/api/prompts/index.ts` (Origin CSRF check → auth → null-client check → `formData()` → inline validation → insert → redirect).
  - API update/delete: `src/pages/api/prompts/[id].ts` (`action=delete` branch vs. default update; both double-check `.eq("user_id", user.id).select("id").single()`).
- **Nav** — `src/components/Topbar.astro:10-15` defines the `nav` array (Dashboard, Research, Prompts, Settings).
- **Protected routes** — `src/middleware.ts` `PROTECTED_ROUTES` array.
- **Analyses views (Phase 2 targets):**
  - List: `src/pages/analyses/index.astro:14-17` selects `id, title, model, provider, created_at, parent_analysis_id` and builds a forest via `buildAnalysisForest`.
  - Tree types/builder: `src/lib/analyses-tree.ts` — `AnalysisRow` is a `Pick<...>`; `AnalysisTreeNode` extends it. Builder spreads `...row`, so adding a field to `AnalysisRow` and the select carries it through automatically.
  - Tree rendering: `src/components/AnalysisTreeNode.astro` — renders title + `provider / model` + date in two places (the `<details>`/`<summary>` branch and the leaf `<a>` branch).
  - Detail: `src/pages/analyses/[id]/index.astro:17` selects `*` (so `company_id` is already present); separately fetches the parent analysis. A company-name lookup must be added the same way the parent lookup is done.

## Desired End State

A signed-in user can:

1. Open **/watchlist**, see their watched companies (ordered by name) with an empty-state when none exist, and add a company via a form (name required; ticker, exchange, industry, note optional).
2. Open **/watchlist/[id]/edit** to change any field or delete the company. Deleting shows a confirm that warns how many tied analyses will be unlinked (but preserved).
3. See the **linked company name as plain text** on the **/analyses** tree and on the **/analyses/[id]** detail page for any analysis whose `company_id` is set.

Verify: create a company with only a name → succeeds; create one with ticker but no exchange → rejected with a readable message; create a duplicate (user, exchange, ticker) → rejected with "already tracking" message; tie an analysis to a company (via DB/SQL for now, since the picker is S-06) → company name appears on the archive tree and detail page; delete the company → analyses survive with no company label.

### Key Discoveries

- Schema, RLS, and delete-preservation are done — `supabase/migrations/20260529120000_data_schema_and_rls.sql:49-88` and `:126`. **No DB work this slice.**
- The `ticker_exchange_together` CHECK (Postgres error `23514`) and the unique index (Postgres error `23505`) are the only non-obvious validation surfaces.
- `buildAnalysisForest` spreads `...row` (`src/lib/analyses-tree.ts:27-32`), so widening `AnalysisRow` + the SELECT is enough to thread `company_id`/company name to the tree node component.
- The analyses detail page already selects `*` (`src/pages/analyses/[id]/index.astro:17`), so `company_id` is available; only a name lookup needs adding.
- Date formatting in the codebase currently uses `"en-GB"` in the analyses/prompts views (e.g. `AnalysisTreeNode.astro:48`). **Note:** `context/foundation/lessons.md` mandates `"pl-PL"` for any _new_ `toLocaleDateString` call. New code in this slice must use `"pl-PL"`; do not change existing `en-GB` calls (out of scope).

## What We're NOT Doing

- **No company picker on the new-analysis screen** and no Topic auto-populate — that is **S-06 (company-bound-analysis)**.
- **No "Add to watchlist" / "Link to watched company" affordances on the analysis detail view** — that is **S-07 (link-company-from-analysis)**.
- **No dedicated company detail page** and no company-side "all analyses tied to this company" list. FR-023's relationship is surfaced from the _analysis_ side instead (company name on the analysis). This is a deliberate MVP scope cut; the company→analyses direction can be added later.
- **No sort / filter / search controls** on the watchlist list — it is ordered by name via the existing DB index.
- **No new migration** — the schema already satisfies every storage and delete-preservation requirement.
- **No clickable company label** on analyses — plain text only (no read-only company route exists to link to).

## Implementation Approach

Phase 1 clones the `prompts` CRUD surface for `watched_companies`, adding the two constraint validations and a delete flow that counts and warns about tied analyses. Phase 2 widens the analyses list/tree and detail queries to carry the linked company name and renders it as a plain-text label. Phase 2 depends only on the table that already exists, so the two phases are independent, but Phase 1 first gives a way to create companies through the UI for manual testing.

## Critical Implementation Details

- **Postgres error-code mapping (Phase 1).** On insert/update, a violated `ticker_exchange_together` CHECK surfaces as Supabase error code `23514` and a duplicate as `23505`. The API must inspect `error.code` and redirect with a specific friendly message rather than the generic "Failed to save". Validate the both-or-neither rule in application code first (so the common case never reaches the DB), and treat `23505` as the "you already track this ticker" path.
- **Delete warning count (Phase 1).** The edit page must run a `count`-only query of analyses with `company_id = :id` for the current user before rendering, and pass that number into the confirm copy ("N tied analyses will be unlinked but preserved"). The actual unlinking is automatic via `ON DELETE SET NULL` — no manual update needed.

---

## Phase 1: Watchlist CRUD (list, create, edit, delete)

### Overview

Stand up `/watchlist` (list + create), `/watchlist/[id]/edit` (edit + delete-with-warning), the two API routes, the nav entry, and the protected-route registration — mirroring `prompts`.

### Changes Required

#### 1. Protected route + navigation

**File**: `src/middleware.ts`

**Intent**: Require auth for the watchlist pages.

**Contract**: Add `"/watchlist"` to the `PROTECTED_ROUTES` array.

**File**: `src/components/Topbar.astro`

**Intent**: Add a top-nav link to the watchlist.

**Contract**: Add `{ href: "/watchlist", label: "Watchlist" }` to the `nav` array (placement: after Prompts is reasonable). `isActive` already handles `/watchlist/...` sub-paths via its `startsWith` branch.

#### 2. Create API route

**File**: `src/pages/api/watchlist/index.ts`

**Intent**: Handle `POST` to create a watched company, following `api/prompts/index.ts` exactly (Origin CSRF check → `locals.user` → null-client check → `formData()`), with the watchlist-specific validation.

**Contract**: `export const POST: APIRoute`. Fields read from form: `name`, `ticker`, `exchange`, `industry`, `note`. Validation order:

1. `name`: string, trimmed length 1–200, else redirect `/watchlist?error=…`.
2. Normalize each optional field: trimmed non-empty → value, else `null`.
3. Both-or-neither: if exactly one of `ticker`/`exchange` is set, redirect with a "Ticker and exchange must be provided together" message.
4. Optional length guards consistent with other text fields (e.g. industry/note reasonable caps; ticker/exchange short caps).

Insert `{ user_id, name, ticker, exchange, industry, note }`. On error, inspect `error.code`: `23505` → "You already track this ticker on that exchange"; otherwise → "Failed to create company". Success → redirect `/watchlist?ok=1`.

#### 3. Update / delete API route

**File**: `src/pages/api/watchlist/[id].ts`

**Intent**: Handle `POST` for both update (default) and delete (`action=delete`), following `api/prompts/[id].ts`.

**Contract**: `export const POST: APIRoute`. `delete` branch: `supabase.from("watched_companies").delete().eq("id", id).eq("user_id", user.id).select("id").single()` → on error redirect `/watchlist?error=…`, on success `/watchlist?ok=deleted`. (Tied analyses are unlinked automatically by the FK.) Default update branch: same field validation as create (including both-or-neither and `23505`/`23514` mapping), `update({...}).eq("id", id).eq("user_id", user.id).select("id").single()`, redirect back to `/watchlist/[id]/edit?ok=1` or `…?error=…`.

#### 4. List + create page

**File**: `src/pages/watchlist.astro`

**Intent**: Server-render the user's companies (ordered by name) with a create form, mirroring `prompts.astro` (banners for `?ok=1` / `?ok=deleted` / `?error`).

**Contract**: Frontmatter selects `id, name, ticker, exchange, industry, note` for `user.id` ordered by `name`. Renders: create form (name required + optional ticker/exchange/industry/note inputs with sensible `maxlength`), empty-state when none, and a list where each row shows name (and ticker/exchange when present) with an "Edit" link to `/watchlist/[id]/edit`. No inline delete here (delete lives on the edit page per the chosen structure) — though an inline delete mirroring prompts is acceptable if it reuses the warning count; default to edit-page delete to keep one count query.

#### 5. Edit + delete page

**File**: `src/pages/watchlist/[id]/edit.astro`

**Intent**: Fetch one company (404→redirect `/watchlist`), render an editable form pre-filled with all fields, and a two-step inline delete confirm that warns about tied analyses.

**Contract**: Fetch the company with `.eq("id", id).eq("user_id", user.id).single()`. Additionally run a count query: `supabase.from("analyses").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("company_id", id)` to get `tiedCount`. Edit form posts to `/api/watchlist/[id]`. Delete form posts the same route with hidden `action=delete`; the confirm copy interpolates `tiedCount` ("This will unlink {tiedCount} analyses but they will be preserved."). Reuse the `data-confirm-delete` / `data-delete-confirm` show/hide `<script>` pattern from `prompts.astro`.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- Visiting `/watchlist` while signed out redirects to `/auth/signin`.
- Creating a company with only a name succeeds and it appears in the list.
- Creating a company with a ticker but no exchange (or vice-versa) is rejected with a readable message.
- Creating a second company with the same `(exchange, ticker)` is rejected with the "already track this ticker" message.
- Editing a company's fields persists the changes.
- The watchlist link appears in the top nav and is marked active on `/watchlist` and `/watchlist/[id]/edit`.
- Deleting a company shows a confirm noting the number of tied analyses; after confirming, the company is gone and any tied analyses still exist (verify in the next phase / via Studio).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2. Provide in-browser `fetch()` snippets for any API checks per `context/foundation/lessons.md`.

---

## Phase 2: Surface linked company on analyses

### Overview

Carry the linked company name into the analyses list/tree and detail page, rendering it as a plain-text label wherever an analysis has a `company_id`.

### Changes Required

#### 1. Widen the analyses tree row type

**File**: `src/lib/analyses-tree.ts`

**Intent**: Add the company name to `AnalysisRow` so it flows through `buildAnalysisForest` (which spreads `...row`) to `AnalysisTreeNode`.

**Contract**: Add an optional `company_name: string | null` (not a `Pick` of `Analysis`, since it comes from a joined table). Keep the builder pure — no other change needed because rows are spread.

#### 2. Join company name in the list query

**File**: `src/pages/analyses/index.astro`

**Intent**: Fetch the linked company's name alongside each analysis.

**Contract**: Extend the select to embed the related row: `select("id, title, model, provider, created_at, parent_analysis_id, watched_companies(name)")`. Map the embedded object to a flat `company_name` (e.g. `row.watched_companies?.name ?? null`) when building the `AnalysisRow[]` passed to `buildAnalysisForest`, so the tree type stays flat.

#### 3. Render company label in the tree node

**File**: `src/components/AnalysisTreeNode.astro`

**Intent**: Show the company name as a plain-text label in both the `<summary>` (has-children) branch and the leaf `<a>` branch, in the metadata line next to `provider / model` and date.

**Contract**: When `node.company_name` is truthy, render an extra `<span>` (plus the `·` separator) in the existing `flex` metadata row. Plain text — not a link.

#### 4. Show company on the analysis detail page

**File**: `src/pages/analyses/[id]/index.astro`

**Intent**: Display the linked company name on the detail view.

**Contract**: The main select is `*`, so `company_id` is present. When non-null, fetch the company name with a small lookup mirroring the existing parent fetch: `supabase.from("watched_companies").select("name").eq("id", data.company_id).eq("user_id", user.id).single()`. Render the name as a plain-text label in the detail header/metadata area when present.

### Success Criteria

#### Automated Verification

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification

- For an analysis tied to a company (set `company_id` via Studio/SQL, since the picker is S-06), the company name appears on the `/analyses` tree node and on `/analyses/[id]`.
- For an analysis with `company_id = null`, no company label is shown and the layout is unchanged.
- After deleting that company in `/watchlist`, the analysis still appears in the archive with no company label (confirms `ON DELETE SET NULL` end-to-end).

**Implementation Note**: After automated verification passes, pause for manual confirmation. Provide in-browser `fetch()` snippets / SQL for setting `company_id` on a test analysis per `context/foundation/lessons.md`.

---

## Testing Strategy

### Manual Testing Steps

1. Sign in, open `/watchlist`, confirm empty-state copy.
2. Create a name-only company → appears in list.
3. Create a company with name + ticker + exchange + industry + note → appears with ticker shown.
4. Attempt ticker-without-exchange → readable rejection.
5. Attempt duplicate `(exchange, ticker)` → "already tracking" rejection.
6. Edit a company, change the note → persists.
7. Set `company_id` on an existing analysis (Studio/SQL), open `/analyses` and `/analyses/[id]` → company name shows as plain text in both.
8. From `/watchlist/[id]/edit`, delete the company → confirm shows the tied count; after delete, the analysis survives with no company label.

## Performance Considerations

Negligible. The list query is indexed by `(user_id, name)`. The analyses list adds one embedded join per query; the detail page adds one single-row lookup only when `company_id` is set. The delete-warning count is a `head: true` count query (no row payload).

## Migration Notes

None — the table, RLS, indexes, and the `ON DELETE SET NULL` foreign key already exist.

## References

- Roadmap slice: `context/foundation/roadmap.md` S-05 (lines 142-153)
- PRD: FR-021, FR-022, FR-023 (partial — analysis-side), FR-027
- Schema: `supabase/migrations/20260529120000_data_schema_and_rls.sql:49-88`, `:126`
- CRUD pattern: `src/pages/prompts.astro`, `src/pages/prompts/[id]/edit.astro`, `src/pages/api/prompts/index.ts`, `src/pages/api/prompts/[id].ts`
- Lessons: `context/foundation/lessons.md` (pl-PL locale; in-browser `fetch()` for manual steps)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Watchlist CRUD (list, create, edit, delete)

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck` — 9adfb6f
- [x] 1.2 Linting passes: `npm run lint` — 9adfb6f
- [x] 1.3 Production build succeeds: `npm run build` — 9adfb6f

#### Manual

- [x] 1.4 `/watchlist` redirects to `/auth/signin` when signed out
- [x] 1.5 Creating a name-only company succeeds and lists
- [x] 1.6 Ticker-without-exchange (or vice-versa) is rejected with a readable message
- [x] 1.7 Duplicate `(exchange, ticker)` is rejected with "already tracking" message
- [x] 1.8 Editing a company's fields persists
- [x] 1.9 Watchlist nav link present and active on watchlist routes
- [x] 1.10 Delete shows tied-analyses count; after confirm, company gone and tied analyses preserved

### Phase 2: Surface linked company on analyses

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Company name shows on `/analyses` tree node and `/analyses/[id]` for a tied analysis
- [ ] 2.5 No company label shown when `company_id` is null; layout unchanged
- [ ] 2.6 After deleting the company, the analysis survives with no company label
