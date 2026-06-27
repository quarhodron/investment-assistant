# Company-bound Analysis Implementation Plan

## Overview

Add an optional watched-company picker to the new-analysis screen. When a user picks a watched company, the Topic field auto-populates with `name (ticker)` (and stays editable), and the resulting analysis is filed under that company via `company_id`. Continued analyses inherit the parent's `company_id` unchanged and frozen (FR-026). Only the user's Topic + prompt + additional context reach the AI — no watchlist-injection block (Business Logic #3). The backend is hardened so a `company_id` is only accepted when it belongs to the requesting user, degrading gracefully to an unlinked analysis if the company is missing at run time.

## Current State Analysis

The data layer and API are **already wired for `company_id`** — this slice is almost entirely front-end plus one backend hardening step.

- `analyses.company_id` exists as a nullable FK to `watched_companies(id)` with `ON DELETE SET NULL` (migration `20260602000000_drop_analysis_type.sql`; index `analyses_user_company_created_idx`). `company_id IS NULL` vs `NOT NULL` is the sole "tied to a company?" discriminator.
- `validateRunInput` already parses `company_id` from the request body (`src/lib/validation.ts:38,82`).
- `run.ts` already inserts `company_id: input.company_id ?? null` into the `analyses` row (`src/pages/api/ai/run.ts:159`).
- **Gap:** `company_id` is inserted **without verifying it belongs to the requesting user**. RLS scopes the analysis row by `user_id`, and the FK only guarantees the company row _exists_ — so a crafted request could file an analysis under another user's company id.
- The new-analysis form (`NewAnalysisForm.tsx`) currently sends no `company_id` and has no picker. Its model and prompt selectors are native `<select>` elements — the picker should match.
- The continue page (`continue.astro:17-23`) loads the parent's `id, title, input, extra_context, prompt_id, prompt_name_snapshot` but **not** `company_id`. The continue form sends `parent_analysis_id` but no `company_id`.
- Watched companies are fetched **inline in Astro pages** (no service/helper). `watchlist.astro:21-25` already uses the exact pattern to reuse: `.select("id, name, ticker, exchange, industry, note").eq("user_id", user.id).order("name")`.
- The AI prompt composition (`anthropic.ts`/`openai.ts`) sends only `Topic` + `Instructions` + optional `Additional context`. This stays untouched — Business Logic #3.

### Key Discoveries:

- `analyses.company_id` end-to-end ready: `validation.ts:38,82` parses it, `run.ts:159` inserts it. No migration, no API request/response shape change needed.
- Ownership of `company_id` is unverified at `run.ts:159` — the one real correctness gap.
- Parent fetch at `run.ts:112-126` proves chain ownership via `.eq("user_id", user.id)`; the same pattern verifies company ownership.
- `continue.astro:17-23` parent select omits `company_id` — one field to add.
- `watchlist.astro:21-25` is the canonical "list my companies" query to reuse on `new.astro`.

## Desired End State

- On `/analyses/new`, a user with ≥1 watched company sees an optional company picker (native `<select>`, `— No company —` default). Picking a company sets Topic to `name (ticker)` (or just `name` when ticker is null) and remains editable. Running the analysis files it under that company (`company_id` set); the analysis detail and list views already render the linked company name.
- A user with no watched companies sees no picker — just a subtle hint pointing to the Watchlist.
- On `/analyses/[id]/continue`, the child analysis inherits the parent's `company_id` unchanged and frozen — no picker, no way to re-pick or clear. The child is dual-linked: `parent_analysis_id` to the parent and `company_id` to the same company.
- The backend only persists a `company_id` that belongs to the requesting user; a foreign or deleted company id results in an analysis saved with `company_id = null` (never a failed run, never a cross-user link).

Verify: pick a company on new-analysis → Topic auto-fills → run → analysis detail shows the company name and `company_id` is set in the DB. Continue that analysis → child row has the same `company_id` and a `parent_analysis_id`. Attempt a crafted run with a foreign `company_id` → analysis saved with `company_id = null`.

## What We're NOT Doing

- **No watchlist-injection into the AI prompt.** Industry/exchange/note/ticker never reach the model — only Topic + prompt + additional context (Business Logic #3). The AI composition in `anthropic.ts`/`openai.ts` is untouched.
- **No schema migration.** `company_id` and its index already exist.
- **No change to the `/api/ai/run` request/response shape.** `company_id` is already an accepted field.
- **No re-pick or clear of the company link on continue** (FR-026) — frozen for the chain.
- **No "link/promote from an existing analysis" affordances** — that is S-07 (`link-company-from-analysis`).
- **No searchable combobox / new shadcn component** — native `<select>` to match existing selectors.

## Implementation Approach

Three phases, ordered so the backend contract is solid before the UI sends `company_id`:

1. Harden `run.ts` to verify company ownership (new runs) and inherit silently (continue), degrading to `null` on a missing company.
2. Add the picker + Topic auto-populate to the new-analysis page/form and send `company_id`.
3. Pass the parent's `company_id` frozen through the continue page/form.

The ownership check reuses the exact `.eq("id", ...).eq("user_id", user.id)` pattern already used for the parent fetch. The picker reuses the `watchlist.astro` query and the form's existing native-`<select>` idiom.

## Critical Implementation Details

- **Ownership check placement & graceful degradation** — In `run.ts`, the company-ownership lookup must run only for **new** runs (no `parent_analysis_id`) and only when `company_id` is present. On a missing/foreign company row, do **not** error the SSE stream — coerce the effective company id to `null` and continue, so the AI run is never wasted and no cross-user link is persisted. For continue runs, `company_id` is inherited from the parent (already RLS-verified) and is **not** re-checked.
- **Auto-populate is destructive on every pick (by decision)** — picking/re-picking a company always overwrites Topic with `name (ticker)`. No "preserve hand-edited Topic" tracking. Selecting `— No company —` clears `company_id` but leaves Topic text as-is.
- **Ticker may be null** — `watched_companies.ticker` is nullable. Compose Topic as `name (ticker)` only when ticker is present; otherwise use `name` alone.

## Phase 1: Backend ownership hardening

### Overview

Make `run.ts` accept a `company_id` only when it belongs to the requesting user, and inherit it untouched on continue. A foreign or deleted company id yields an analysis saved with `company_id = null` rather than a failed run or a cross-user link.

### Changes Required:

#### 1. Company-ownership verification in the run handler

**File**: `src/pages/api/ai/run.ts`

**Intent**: Before building the insert row, resolve the effective `company_id`. For new runs (no `parent_analysis_id`) carrying a `company_id`, confirm a matching `watched_companies` row exists for `user.id`; if not, fall back to `null`. For continue runs, leave `input.company_id` handling as inheritance (Phase 3 supplies it from the parent) and do not re-verify.

**Contract**: Introduce a resolved value (e.g. `resolvedCompanyId`) used at the insert site instead of `input.company_id ?? null` (currently `run.ts:159`). The ownership lookup mirrors the existing parent fetch (`run.ts:112-118`): `supabase.from("watched_companies").select("id").eq("id", input.company_id).eq("user_id", user.id).maybeSingle()`. A missing row → `resolvedCompanyId = null` (no SSE error). Place the check after context resolution and before the `runAiAnalysis` call so a foreign id never reaches persistence.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- A new run with a valid own `company_id` saves the analysis with that `company_id` set (verify in Supabase Studio).
- A new run with a `company_id` belonging to another user (crafted via browser `fetch()`) saves the analysis with `company_id = null` and the run completes normally.
- A new run with a `company_id` for a row deleted just before submit saves with `company_id = null` and does not error.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: New-analysis company picker + Topic auto-populate

### Overview

Load the user's watched companies on the new-analysis page, add an optional native-`<select>` picker, auto-populate Topic on pick, and send `company_id` in the run payload. Hide the picker entirely when the watchlist is empty.

### Changes Required:

#### 1. Load watched companies on the new-analysis page

**File**: `src/pages/analyses/new.astro`

**Intent**: Fetch the current user's watched companies SSR and pass them to `NewAnalysisForm` as a prop, so the form can render the picker without a client-side fetch.

**Contract**: Reuse the `watchlist.astro:21-25` query — `.from("watched_companies").select("id, name, ticker").eq("user_id", user.id).order("name")`. Pass the resulting array (shape `Pick<WatchedCompany, "id" | "name" | "ticker">[]`) as a new `companies` prop on the form island.

#### 2. Picker control + auto-populate + payload wiring

**File**: `src/components/NewAnalysisForm.tsx`

**Intent**: Accept the new `companies` prop. When the list is non-empty, render a native `<select>` (matching the existing model/prompt selectors) above or alongside Topic, with a `— No company —` default option and each company shown as `name (ticker)` (or `name` when ticker is null). On change: set a `companyId` state and, when a real company is selected, overwrite the Topic input with the composed label (always overwrite). When the list is empty, render no picker — instead a small hint (e.g. "Add companies in your Watchlist to link analyses."). Add `company_id` to the POST payload when a company is selected.

**Contract**: New state `companyId: string` (empty string = no company). Option label helper: `ticker ? \`${name} (${ticker})\` : name`. Topic state setter is called with that label on every company selection. Payload gains `company_id: companyId`only when`companyId`is non-empty (omit otherwise, matching how`extra_context`is conditionally added at`NewAnalysisForm.tsx:142-144`). The picker is **optional** — submit-enable logic is unchanged (does not depend on `companyId`).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- With ≥1 watched company, the picker appears and lists companies as `name (ticker)` (and `name` alone for a tickerless company).
- Picking a company auto-fills Topic with the composed label; the Topic field remains editable and the typed value is what's sent.
- Re-picking a different company overwrites Topic again; selecting `— No company —` leaves Topic text unchanged and sends no `company_id`.
- Running with a company selected produces an analysis whose detail view shows the linked company name.
- With zero watched companies, no picker renders — only the hint text; analyses can still be run normally.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Continue-analysis link inheritance (frozen)

### Overview

Carry the parent analysis's `company_id` through the continue flow unchanged and frozen — no picker, no re-pick, no clear (FR-026). The child analysis is dual-linked via `parent_analysis_id` and the inherited `company_id`.

### Changes Required:

#### 1. Load parent's company_id on the continue page

**File**: `src/pages/analyses/[id]/continue.astro`

**Intent**: Add `company_id` to the parent-analysis select so it can be threaded into the continue form.

**Contract**: Extend the existing parent select (`continue.astro:17-23`) to include `company_id`. Pass it to `ContinueAnalysisForm` (e.g. as part of the existing `parentAnalysis` prop object).

#### 2. Send inherited company_id from the continue form

**File**: `src/components/ContinueAnalysisForm.tsx`

**Intent**: Include the inherited `company_id` in the run payload when present. No UI control is added — the link is invisible and frozen.

**Contract**: Read `parentAnalysis.company_id`; add `company_id: parentAnalysis.company_id` to the payload when it is non-null (same conditional-add idiom as `extra_context`). No new form state, no picker, no clear affordance.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run typecheck`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Continuing a company-linked analysis produces a child row with the **same** `company_id` and a `parent_analysis_id` pointing at the parent (verify in Supabase Studio).
- Continuing an unlinked analysis (`company_id` null) produces a child with `company_id` null — no error.
- The continue screen shows no company picker or link control.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Manual Testing Steps:

> Per project lessons: for any API request, use an in-browser `fetch()` snippet (cookies are sent automatically) rather than curl.

1. **Happy path (new):** Add a company in `/watchlist`, go to `/analyses/new`, pick it → Topic auto-fills `name (ticker)` → run → open the analysis → company name shown. Confirm `company_id` set in Supabase Studio.
2. **Auto-populate edge:** Pick company A (Topic fills), pick company B (Topic overwrites), select `— No company —` (Topic text stays, no link sent).
3. **Tickerless company:** Add a company with no ticker → picker shows `name` only → Topic fills with `name`.
4. **Empty watchlist:** With no companies, `/analyses/new` shows the hint and no picker; a run still works.
5. **Ownership (security):** From the browser console on `/analyses/new`, `fetch('/api/ai/run', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ...validPayload, company_id: '<another-users-company-uuid>' }) })` → analysis saves with `company_id = null`.
6. **Stale link:** Pick a company, delete it from `/watchlist` in another tab, then submit → analysis saves with `company_id = null`, no error.
7. **Continue inheritance:** Continue a company-linked analysis → child has same `company_id` + `parent_analysis_id`; no picker on the continue screen.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-06, lines 155-166)
- PRD: FR-010 (picker + Topic auto-populate), FR-026 (frozen link on continue), FR-014, Business Logic #3 — `context/foundation/prd.md:107-142`
- Backend insert site: `src/pages/api/ai/run.ts:110-165`
- Validation: `src/lib/validation.ts:24-86`
- Reuse query: `src/pages/watchlist.astro:21-25`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend ownership hardening

#### Automated

- [x] 1.1 Type checking passes: `npm run typecheck`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 1.4 New run with valid own `company_id` saves with that `company_id` set
- [ ] 1.5 New run with a foreign `company_id` saves with `company_id = null`, run completes
- [ ] 1.6 New run with a deleted `company_id` saves with `company_id = null`, no error

### Phase 2: New-analysis company picker + Topic auto-populate

#### Automated

- [ ] 2.1 Type checking passes: `npm run typecheck`
- [ ] 2.2 Linting passes: `npm run lint`
- [ ] 2.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 2.4 Picker lists companies as `name (ticker)` (and `name` alone when tickerless)
- [ ] 2.5 Picking auto-fills Topic; field stays editable and the typed value is sent
- [ ] 2.6 Re-pick overwrites Topic; `— No company —` leaves Topic and sends no `company_id`
- [ ] 2.7 Run with a company selected shows the linked company name on detail
- [ ] 2.8 Zero watched companies → no picker, only the hint; runs still work

### Phase 3: Continue-analysis link inheritance (frozen)

#### Automated

- [ ] 3.1 Type checking passes: `npm run typecheck`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 3.4 Continuing a linked analysis → child has same `company_id` + `parent_analysis_id`
- [ ] 3.5 Continuing an unlinked analysis → child `company_id` null, no error
- [ ] 3.6 Continue screen shows no company picker or link control
