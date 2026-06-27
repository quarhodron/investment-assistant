# Dashboard: Add Watched-Companies Stat & Remove Workspace Aside — Implementation Plan

## Overview

Two scoped edits to the authenticated dashboard (`src/pages/dashboard.astro`):

1. Add a fifth stat tile — **Watchlist** — in the top metrics row, positioned between "Prompts · saved" and "API keys", showing the count of the user's watched companies.
2. Remove the entire right-hand **Workspace** aside (setup checklist + quick-action links), and let the "Recent research" column reclaim the full width.

## Current State Analysis

- The dashboard is a single pure-Astro page, server-rendered. All data is fetched in the frontmatter via a `Promise.all` of Supabase queries (`dashboard.astro:27-42`).
- The stat row is a hard-coded array of four tiles rendered into a `grid-cols-2 ... lg:grid-cols-4` grid (`dashboard.astro:87-113`). Tile shape: `{ label, value, suffix, accent? }`. The `accent` flag renders a small green dot (`bg-positive`) — currently used by "This week" when `weekAnalyses > 0`.
- The page body is a two-column `lg:grid-cols-12` layout: "Recent research" at `lg:col-span-8` (`dashboard.astro:118-178`) and the **Workspace** `<aside>` at `lg:col-span-4` (`dashboard.astro:181-253`).
- The aside contains the API-key/prompt setup checklist and three quick links: New analysis, Manage prompts, Settings.
- `watched_companies` has a `(user_id, name)` index but no `(user_id, created_at)` index. A `count: "exact", head: true` query filtered by `user_id` is a covered, cheap count — no schema change needed.

### Key Discoveries:

- **Topbar already covers all navigation lost with the aside** — `Topbar.astro:10-16` renders Dashboard / Research / Prompts / Watchlist / Settings nav on every authenticated page, and `Topbar.astro:59-64` renders a prominent `+ New analysis` CTA. So dropping the aside's links is a no-op for navigation.
- **The count-query pattern is already established** — `dashboard.astro:28,34` use `.select("id", { count: "exact", head: true }).eq("user_id", user.id)`. The new watched-companies count is an exact copy against the `watched_companies` table.
- **`Promise.all` destructuring order is positional** (`dashboard.astro:27`). Adding a sixth query means adding both the query and its destructured result variable in matching positions.
- **Locale note (lessons.md):** the team rule says use `'pl-PL'` for date formatting, but this page uses `'en-GB'` (`dashboard.astro:59,167`). This plan does **not** touch date formatting — neither edit adds or changes a `toLocale*` call — so the existing `en-GB` usage is left as-is and out of scope.

## Desired End State

On `/dashboard` for an authenticated user:

- The top metrics row shows **five** tiles in a single row on large screens (`lg:grid-cols-5`), still two-wide on mobile. Order: Analyses · total → This week → Prompts · saved → **Watchlist** → API keys.
- The Watchlist tile reads the user's watched-company count, with suffix `cos` and a green accent dot when the count is greater than zero.
- The page body is a single full-width "Recent research" column. The Workspace aside (checklist + quick links) is gone.

Verifiable by: `npm run lint` and `npm run build` pass; loading the dashboard shows five tiles with a correct watched-companies count and no right sidebar.

## What We're NOT Doing

- Not adding `updated_at` to analyses or changing what "Recent research" means.
- Not changing date formatting or locale (the `en-GB`/`pl-PL` discrepancy is noted but out of scope here).
- Not relocating any quick-action links — Topbar covers them; they are simply removed.
- Not touching the watchlist page, API routes, types, or any migration.
- Not adding a watched-companies index (the count query does not warrant one).

## Implementation Approach

A single-file edit to `src/pages/dashboard.astro`, in one phase:

1. Add a `watched_companies` count query to the existing `Promise.all`, destructure its result, and store it in a new `watchedCount` variable (default `0`).
2. Insert the Watchlist tile object into the stat array between the Prompts and API-keys entries.
3. Change the stat-row grid from `lg:grid-cols-4` to `lg:grid-cols-5`.
4. Delete the `<aside>` block and change the Recent-research wrapper so the column is full-width (remove the `lg:col-span-8` constraint / collapse the `lg:grid-cols-12` two-column wrapper).

## Phase 1: Add Watchlist stat and remove Workspace aside

### Overview

Wire in the watched-companies count, render it as the fifth stat tile, widen the stat grid to five columns, and remove the aside so Recent research spans full width.

### Changes Required:

#### 1. Watched-companies count query + state

**File**: `src/pages/dashboard.astro`

**Intent**: Fetch the count of the user's watched companies alongside the existing dashboard queries, defaulting to `0` when Supabase or the user is absent (mirroring the existing `totalAnalyses`/`promptCount` handling).

**Contract**: Add a `let watchedCount = 0;` near the other counters (`dashboard.astro:18-22`). Add a sixth query to the `Promise.all` (`dashboard.astro:27-42`) — `supabase.from("watched_companies").select("id", { count: "exact", head: true }).eq("user_id", user.id)` — and extend the destructuring tuple with its result in the matching position, then assign `watchedCount = <res>.count ?? 0;`. Keep destructuring order and result-assignment order aligned.

#### 2. Watchlist stat tile

**File**: `src/pages/dashboard.astro`

**Intent**: Add the Watchlist tile to the stat array, positioned between the "Prompts · saved" and "API keys" entries, with a green accent dot when the user watches at least one company.

**Contract**: Insert an object into the stat array (`dashboard.astro:92-101`) after the Prompts entry: `{ label: "Watchlist", value: watchedCount, suffix: "companies", accent: watchedCount > 0 }`. No change to the tile-rendering markup — it already handles `label`/`value`/`suffix`/`accent`.

#### 3. Stat-row grid → five columns

**File**: `src/pages/dashboard.astro`

**Intent**: Lay out all five tiles in a single row on large screens.

**Contract**: In the stat `<section>` class list (`dashboard.astro:88`), change `lg:grid-cols-4` to `lg:grid-cols-5`. Mobile stays `grid-cols-2` (the fifth tile sits alone in the final mobile row — acceptable).

#### 4. Remove Workspace aside, make Recent research full-width

**File**: `src/pages/dashboard.astro`

**Intent**: Delete the entire Workspace aside and let Recent research occupy the full content width.

**Contract**: Remove the `<aside>...</aside>` block (`dashboard.astro:181-253`). Collapse the two-column wrapper so Recent research is full-width: either drop the `lg:grid-cols-12` grid wrapper (`dashboard.astro:116`) in favor of a plain block, or remove the `lg:col-span-8` from the Recent-research `<div>` (`dashboard.astro:118`) and the grid. Result: no horizontal divider/`lg:border-l` remnants, Recent research spans the container.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Dashboard shows five stat tiles in one row on a wide viewport, ordered: Analyses · total, This week, Prompts · saved, Watchlist, API keys.
- The Watchlist tile value equals the number of companies on `/watchlist`; its green accent dot appears only when that count is greater than zero. Verify count via browser console: `await fetch('/watchlist').then(r => r.text()).then(t => (t.match(/data-company-id|watched_companies/g) || []).length)` is a rough cross-check — authoritative check is to compare the tile number against the rows visible on the `/watchlist` page.
- The right-hand Workspace sidebar (setup checklist + quick links) is no longer present; Recent research spans the full width with no leftover left-border or empty column.
- Navigation still works via the Topbar (Research / Prompts / Watchlist / Settings and the `+ New analysis` button).
- Mobile (narrow viewport): tiles render two-per-row without overflow; the lone fifth tile is acceptable.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding (this is the final phase).

---

## Testing Strategy

### Manual Testing Steps:

1. Run `npm run dev`, sign in, and open `/dashboard`.
2. Confirm five tiles in the order above; note the Watchlist number.
3. Open `/watchlist` and confirm the company count matches the tile.
4. Add or remove a company, return to `/dashboard`, confirm the tile updates and the accent dot toggles at the 0↔1 boundary.
5. Confirm the Workspace aside is gone and Recent research is full-width.
6. Resize to mobile width; confirm tile wrapping is clean.

## Performance Considerations

Adds one `count`/`head` query to the existing `Promise.all` — runs in parallel, negligible cost, filtered by `user_id`. No new index required.

## Migration Notes

None — no schema or data changes.

## References

- Dashboard page: `src/pages/dashboard.astro:27-113` (queries + stat row), `:116-253` (two-column body + aside)
- Topbar nav/CTA (covers removed links): `src/components/Topbar.astro:10-16,59-64`
- `watched_companies` schema: `supabase/migrations/20260529120000_data_schema_and_rls.sql:51-87`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add Watchlist stat and remove Workspace aside

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 466d677
- [x] 1.2 Production build succeeds: `npm run build` — 466d677

#### Manual

- [x] 1.3 Five stat tiles render in one row, correct order (Analyses, This week, Prompts, Watchlist, API keys) — 466d677
- [x] 1.4 Watchlist tile value matches `/watchlist` count; accent dot appears only when count > 0 — 466d677
- [x] 1.5 Workspace aside removed; Recent research spans full width with no layout remnants — 466d677
- [x] 1.6 Topbar navigation + New analysis CTA still functional — 466d677
- [x] 1.7 Mobile viewport: tiles wrap cleanly — 466d677
