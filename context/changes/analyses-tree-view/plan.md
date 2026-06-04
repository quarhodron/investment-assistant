# Analyses Tree View Implementation Plan

## Overview

Replace the flat `/analyses` list with a server-rendered **forest of chain-roots**. Each chain-root is a collapsible group; expanding it reveals the full subtree (recursive children) that grew out of "Continue analysis" runs. Roots are ordered by latest-activity-in-chain (desc) so a dormant chain you just continued today bubbles to the top. The change is UI-only — no schema, no API, no new dependencies.

## Current State Analysis

- `/analyses` ([src/pages/analyses/index.astro](../../../src/pages/analyses/index.astro)) renders all the user's analyses as a flat `<ul>` ordered by `created_at` desc. Chain relationships are invisible at the list level — a user with a 6-step chain sees 6 unrelated rows.
- The chain is first-class in data: `analyses.parent_analysis_id` is a self-FK with `ON DELETE SET NULL` ([supabase/migrations/20260529120000_data_schema_and_rls.sql](../../../supabase/migrations/20260529120000_data_schema_and_rls.sql) line 125), and a partial index `analyses_user_parent_idx` on `(user_id, parent_analysis_id) WHERE parent_analysis_id IS NOT NULL` (line 186) keeps subtree lookups cheap. RLS already isolates per-user.
- The detail page ([src/pages/analyses/[id]/index.astro](../../../src/pages/analyses/%5Bid%5D/index.astro) lines 26–43, 80–101) already renders the chain one hop at a time ("Continued from: …" / "Continued as: …"). This change extends the chain view to the **list page only**; the detail page's mini-chain block is left as-is.
- The detail page already uses native `<details>` / `<summary>` for the "Prompt Used" and "Sources" sections ([src/pages/analyses/[id]/index.astro](../../../src/pages/analyses/%5Bid%5D/index.astro) lines 117–155). The tree view will reuse that same SSR-only disclosure pattern.
- Installed shadcn primitives: `button`, `card`, `input`, `label`, `select` (`src/components/ui/`). No tree, Accordion, or Collapsible component is installed, and none is needed for this change.

### Key Discoveries

- Native `<details>` + Tailwind `open:` variants give us animated chevron + per-node disclosure for zero hydration cost — matches the SSR-first pattern used everywhere else in this codebase.
- Astro components recurse cleanly via `Astro.self`, which lets the tree node component render its own children without a separate file or a React island.
- Per [context/foundation/lessons.md](../../foundation/lessons.md): every `toLocaleDateString` / `toLocaleString` call must pass `'pl-PL'`. The current list already follows this on line 60 of `analyses/index.astro`; the tree view preserves it.
- Per [CLAUDE.md](../../../CLAUDE.md): use `cn()` from `@/lib/utils` for any conditional class merging; never concatenate Tailwind strings manually.

## Desired End State

A signed-in user visiting `/analyses` sees:

- A forest of **chain-roots**: each top-level row is either a singleton analysis or the root of a continue-analysis chain.
- Chain-roots with children render as a collapsible `<details>` showing the root's title + provider/model + created date + a `· N steps` badge where N is the total number of analyses in the subtree (root included).
- Singleton analyses (no children) render as plain rows visually consistent with chain-roots minus the badge and chevron.
- All roots collapsed by default; clicking a root reveals its descendants as nested rows indented by depth, ordered by `created_at` asc (oldest-first — the natural reading order of a chain).
- Roots are ordered by **latest activity in the chain** (max `created_at` across the subtree) descending — so any chain you touched today is at the top.
- Branches: a parent with multiple children renders all of them as siblings, each potentially expanding into its own subtree.
- Orphans (rows whose `parent_analysis_id` is NULL because the parent was deleted) appear at the top level as their own chain-roots, indistinguishable from genuine roots.
- The existing empty state ("No analyses yet — run your first one.") and "New Analysis" CTA are preserved unchanged.

Verification: the manual checks in each phase's Success Criteria.

## What We're NOT Doing

- No changes to the detail page (`/analyses/[id]`) — its "Continued from / Continued as" block stays as is.
- No changes to the dashboard or any other surface — only `/analyses` index.
- No search, filter, or sort toggle. Browser Cmd-F still works after a node is expanded.
- No pagination or lazy loading — the whole forest is fetched in one query and rendered SSR.
- No backend changes: no migration, no new API route, no extra index.
- No new dependencies: no shadcn Collapsible, no Radix package, no React island.
- No per-root expanded-state persistence (no localStorage, no URL state).
- No grouping by watched company, no "Orphaned" badge or section.
- No bulk actions on chains (no delete-chain, no move-chain).

## Implementation Approach

Two phases:

1. A pure helper `buildAnalysisForest` in [src/lib/analyses-tree.ts](../../../src/lib/analyses-tree.ts) plus a `AnalysisTreeNode` type — pure data transformation, no rendering.
2. A recursive Astro component [src/components/AnalysisTreeNode.astro](../../../src/components/AnalysisTreeNode.astro) plus a rewrite of [src/pages/analyses/index.astro](../../../src/pages/analyses/index.astro) to call the helper and render the forest.

The split keeps the data-shaping logic isolated from the rendering and gives each phase its own lint/typecheck gate.

## Critical Implementation Details

**Orphan classification**: rows whose `parent_analysis_id` is non-null but references a row not present in the user's result set (theoretically possible if RLS hides it, in practice should never occur for self-owned data) must be promoted to roots — not silently dropped. The helper treats "parent not in the map" the same as "parent is NULL". This keeps the rendered forest a complete cover of the input rows even if data is unexpectedly partial.

**Subtree ordering must be computed after the full tree is linked**, not during the first pass. The "latest activity in chain" sort key for a root depends on the max `created_at` across all its descendants, which is only known once children are attached. A single bottom-up walk after linking computes both `subtreeLatestCreatedAt` and `subtreeSize` per node.

---

## Phase 1: Tree-building helper + type

### Overview

Add a pure function that takes the flat list of analyses fetched from Supabase and returns the sorted forest with per-node child arrays, subtree size, and subtree latest-activity timestamp. No rendering, no Supabase calls — just data transformation.

### Changes Required

#### 1. New file: `src/lib/analyses-tree.ts`

**File**: `src/lib/analyses-tree.ts`

**Intent**: Expose `buildAnalysisForest()` — a pure function consumed by the analyses index page. It groups the user's flat analyses list into a forest of trees by walking `parent_analysis_id`, attaches descendants under each parent, treats rows with a missing/unknown parent as roots, then computes per-node subtree size and subtree latest-activity timestamp in one bottom-up pass. Finally it sorts roots by `subtreeLatestCreatedAt` desc and children by `created_at` asc at every level.

**Contract**:

- Signature: `buildAnalysisForest(rows: AnalysisRow[]): AnalysisTreeNode[]` where `AnalysisRow` is the minimal projection `Pick<Analysis, "id" | "title" | "model" | "provider" | "created_at" | "parent_analysis_id">`.
- Export both the function and a public `AnalysisTreeNode` type:
  ```ts
  export type AnalysisTreeNode = AnalysisRow & {
    children: AnalysisTreeNode[];
    subtreeSize: number; // total nodes including self
    subtreeLatestCreatedAt: string; // ISO string; max(created_at) across subtree including self
  };
  ```
- Return value: array of root nodes. Each node's `children` is recursively sorted asc by `created_at`. Roots are sorted desc by `subtreeLatestCreatedAt`.
- Invariant: the returned forest covers exactly the input rows once (no duplication, no loss). A unit-level mental check is `sum(subtreeSize over roots) === rows.length`.
- Pure: no I/O, no Date side effects beyond reading `created_at` strings — ISO strings compare correctly with `<` / `>`, so no `Date` parsing needed for sort keys.

#### 2. Updated file: `src/types.ts`

**File**: `src/types.ts`

**Intent**: No change required if `Analysis` already exposes the columns we project. The helper imports `Analysis` from `@/types` directly. Leave `src/types.ts` alone unless TypeScript complains; the projection type `AnalysisRow` lives next to `buildAnalysisForest` in `src/lib/analyses-tree.ts`.

### Success Criteria

#### Automated Verification

- Lint and type check pass: `npm run lint`
- Build passes: `npm run build`

**Implementation Note**: This phase introduces no UI changes and no callers — manual verification is deferred to Phase 2, where the helper is wired into the page. Proceed directly to Phase 2 once automated checks pass.

---

## Phase 2: Recursive tree component + index page rewrite

### Overview

Rewrite the analyses index page to fetch the minimal projection, call `buildAnalysisForest`, and render the resulting roots through a new recursive Astro component. Use native `<details>` for nodes with children; render singletons as plain rows. Preserve the existing empty state, header, and visual language.

### Changes Required

#### 1. New file: `src/components/AnalysisTreeNode.astro`

**File**: `src/components/AnalysisTreeNode.astro`

**Intent**: A recursive Astro component rendering one node of the forest. When the node has children, render a `<details>` whose `<summary>` shows the row's title, provider/model, created date, and `· N steps` chain-depth badge; the body recursively renders each child via `Astro.self` with `depth + 1`, indented. When the node has no children, render a non-disclosable row visually consistent with the disclosed form minus the chevron and badge. All title/badge clicks on the visible row link to `/analyses/[id]`; the `<summary>` toggle affordance (chevron) lives in a separate inline area that is **not** the title link, so the user can independently click "open this analysis" vs "expand the chain".

**Contract**:

- Props: `{ node: AnalysisTreeNode; depth: number }`.
- Indentation: apply a left padding proportional to `depth` (e.g. `style={`padding-left: ${depth \* 1.25}rem`}` or a small lookup). Cap visual indentation at depth 5 to avoid runaway nesting on narrow screens, but continue to render deeper levels at the depth-5 indentation.
- Disclosure markup uses native `<details><summary>…</summary>…</details>`. The `<summary>` row layout: chevron icon (rotated 0° / 90° via Tailwind's `group-open:` variant against a `group` class on the `<details>`), then title + meta + badge. The chevron must use `list-none` and `[&::-webkit-details-marker]:hidden` (or the equivalent Tailwind utility) to suppress the browser's default marker, since we render our own chevron.
- Singletons (`node.children.length === 0`): render a plain `<div>` row, no `<details>`, no chevron, no badge.
- Chain-depth badge text: `· ${node.subtreeSize} steps` only when `subtreeSize > 1`. The badge uses the same `rounded-full bg-slate-500/20 px-2.5 py-0.5 text-xs text-slate-300` styling as the existing provider/model pill on the detail page for visual consistency.
- Title is an `<a href={`/analyses/${node.id}`}>` — clicking title navigates; the chevron area is outside the link so clicking it only toggles disclosure. Do not nest the entire `<summary>` inside an `<a>` (invalid HTML).
- Provider/model and created date follow the same format and locale as the current list (`pl-PL`).
- Children render: `{node.children.map((child) => <Astro.self node={child} depth={depth + 1} />)}` inside the `<details>` body, with a small vertical gap between siblings.

#### 2. Updated file: `src/pages/analyses/index.astro`

**File**: `src/pages/analyses/index.astro`

**Intent**: Replace the flat `<ul>` rendering with the recursive tree. Fetch all of the user's analyses with the minimal projection needed by the forest builder (including `parent_analysis_id`), build the forest, and render each root via `AnalysisTreeNode`. Keep the page header, the empty state, the "New Analysis" CTA, and the `Layout` wrapper exactly as they are today.

**Contract**:

- Supabase query: `select("id, title, model, provider, created_at, parent_analysis_id").eq("user_id", user.id)`. No `.order(...)` needed — the helper sorts internally. Drop the existing `.order("created_at", { ascending: false })`.
- Type: rows typed as `Pick<Analysis, "id" | "title" | "model" | "provider" | "created_at" | "parent_analysis_id">`.
- Import `buildAnalysisForest` from `@/lib/analyses-tree` and the new component from `@/components/AnalysisTreeNode.astro`.
- Render: when `analyses.length === 0` keep the current empty-state block exactly. Otherwise render `roots.map((root) => <AnalysisTreeNode node={root} depth={0} />)` inside the existing container (a vertical stack with the same spacing the current `<ul>` provides).
- Preserve the page title, gradient header text, max-width container, and the `bg-cosmic` background.

### Success Criteria

#### Automated Verification

- Lint and type check pass: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification

- Open `/analyses` in the browser as a signed-in user with at least one chain of depth ≥ 2 — the root row shows a chevron and a `· N steps` badge; the row is collapsed by default.
- Click anywhere on the chevron / summary background (outside the title link) — the chain expands inline, descendants appear indented, in `created_at` ascending order.
- Click the title link of any node — the browser navigates to `/analyses/[id]` (does not toggle expansion).
- Singleton analyses (no children) render with no chevron and no badge, but the same title / provider-model / date line.
- The topmost root is the chain whose latest descendant is most recent — verify by running "Continue analysis" on an older chain and confirming that chain moves to the top after the next reload.
- A branch case (one parent with ≥ 2 children) renders both children as siblings under the parent, each independently expandable if they have their own descendants.
- An orphan (a row whose `parent_analysis_id` points to a deleted analysis, leaving the FK set to NULL) appears at the top level as its own root with no special badge.
- The empty state shows correctly when the user has no analyses — "No analyses yet — run your first one." with the "New Analysis" CTA.
- Dates render in `pl-PL` locale (DD.MM.YYYY) on every row.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before archiving.

---

## Testing Strategy

### Manual Testing Steps

1. Create or identify a user account with at least: (a) one singleton analysis with no children, (b) one chain of depth ≥ 3, and (c) one parent with ≥ 2 children. If (c) doesn't exist, create it by running "Continue analysis" twice from the same parent.
2. Load `/analyses` — confirm all roots render collapsed with correct `· N steps` badges (count includes the root itself, so a 3-step chain shows `· 3 steps`).
3. Verify root ordering: the chain with the most-recently-created descendant is at the top, even if its root is the oldest.
4. Expand each root — confirm descendants are indented and ordered by `created_at` asc.
5. Click a node title — confirm navigation to `/analyses/[id]` (no expand toggle).
6. Click the chevron / summary area of a node — confirm expand/collapse toggles without navigating.
7. From a chain root's detail page, run "Continue analysis" → return to `/analyses` and reload → confirm the just-updated chain bubbled to the top.
8. Manually `update analyses set parent_analysis_id = null where id = '<some child id>'` in Supabase Studio (against a test row) → reload `/analyses` → confirm that row now appears as its own top-level root.

### Edge Cases to Verify Manually

- User with zero analyses → empty state renders.
- User with only singletons → forest of bare rows, no chevrons, no badges.
- A chain of depth 5+ → indentation visibly caps at the configured maximum on narrow viewports; deeper rows remain readable.

## Performance Considerations

- One Supabase query returns the user's full analyses list with a six-column projection. At the v1 user volume (a few hundred analyses), this is a sub-kilobyte SSR payload and a single index-aided scan on `analyses` filtered by `user_id`.
- Tree construction is O(n) — one pass to index by id, one pass to attach to parents, one bottom-up DFS for `subtreeSize` and `subtreeLatestCreatedAt`. Final sort is O(k log k) per parent where k is its child count.
- No client-side JS. `<details>` open/close is browser-native, zero hydration. Pages with hundreds of rows render as a single HTML document and stay interactive without any island.

## Migration Notes

None. Schema unchanged, no data backfill, no API contract change. The detail page's parent/child links continue to work because they reference `analyses.parent_analysis_id` directly.

## References

- Roadmap context: [context/foundation/roadmap.md](../../foundation/roadmap.md) — S-02 ("continue-analysis chain") shipped the data model this UI exposes.
- Schema: [supabase/migrations/20260529120000_data_schema_and_rls.sql](../../../supabase/migrations/20260529120000_data_schema_and_rls.sql) lines 125, 186 — self-FK + partial index.
- Existing list page: [src/pages/analyses/index.astro](../../../src/pages/analyses/index.astro)
- Existing disclosure pattern: [src/pages/analyses/[id]/index.astro](../../../src/pages/analyses/%5Bid%5D/index.astro) lines 117–155 (`<details>` for Prompt Used and Sources).
- Existing one-hop chain rendering: [src/pages/analyses/[id]/index.astro](../../../src/pages/analyses/%5Bid%5D/index.astro) lines 26–43, 80–101.
- Lessons: [context/foundation/lessons.md](../../foundation/lessons.md) — `pl-PL` locale rule.

---

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tree-building helper + type

#### Automated

- [x] 1.1 Lint and type check pass: `npm run lint` — 0039684
- [x] 1.2 Build passes: `npm run build` — 0039684

### Phase 2: Recursive tree component + index page rewrite

#### Automated

- [x] 2.1 Lint and type check pass: `npm run lint` — 8dc4706
- [x] 2.2 Build passes: `npm run build` — 8dc4706

#### Manual

- [ ] 2.3 Chain root shows chevron + `· N steps` badge and is collapsed by default
- [ ] 2.4 Clicking chevron/summary expands the chain inline; descendants appear indented in `created_at` asc order
- [ ] 2.5 Clicking a node title navigates to `/analyses/[id]` without toggling expansion
- [ ] 2.6 Singleton analyses render without chevron or badge
- [ ] 2.7 Continuing an older chain bubbles that chain to the top after reload
- [ ] 2.8 Branch (parent with ≥ 2 children) renders both children as siblings
- [ ] 2.9 Orphan (row with `parent_analysis_id = NULL` after parent delete) appears as its own root
- [ ] 2.10 Empty state renders for a user with no analyses
- [ ] 2.11 Dates render in `pl-PL` locale on every row
