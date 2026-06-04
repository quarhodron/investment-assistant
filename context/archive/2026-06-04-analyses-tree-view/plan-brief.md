# Analyses Tree View — Plan Brief

> Full plan: [context/changes/analyses-tree-view/plan.md](./plan.md)

## What & Why

Turn the flat `/analyses` list into a tree that visualizes continue-analysis chains as collapsible groups. The chain is the product's wedge ([context/foundation/roadmap.md](../../foundation/roadmap.md) — S-02), but today it's invisible at the list level — users see N unrelated rows where N is the chain depth. The tree makes the "research thread" model legible at a glance.

## Starting Point

`/analyses` ([src/pages/analyses/index.astro](../../../src/pages/analyses/index.astro)) renders a flat `<ul>` sorted by `created_at` desc; chain links exist in the data (`analyses.parent_analysis_id`) and on the detail page (one hop), but never on the index. Schema, indexes, and RLS are already in place — no backend work needed.

## Desired End State

The user opens `/analyses` and sees one row per chain-root, each marked with a `· N steps` badge and a chevron when it has descendants. Clicking the chevron expands the chain inline, indented in the order the user built it. Roots sort by the chain's latest activity, so anything you touched today is on top. Singletons appear as plain rows.

## Key Decisions Made

| Decision             | Choice                                                                       | Why (1 sentence)                                                                                                          | Source |
| -------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------ |
| Scope                | Only the `/analyses` index page                                              | Smallest focused change — detail page and dashboard untouched.                                                            | Plan   |
| Tree shape           | Forest of chain-roots (each root is a collapsible group)                     | Matches the "each chain is one research thread" mental model and keeps scanning fast.                                     | Plan   |
| Default expand state | All collapsed with chain-depth badge (`· N steps`)                           | Compact by default; the badge signals which chains have depth worth exploring.                                            | Plan   |
| Ordering             | Roots by latest-activity-in-chain desc; descendants by `created_at` asc      | A chain continued today bubbles to the top; in-chain reading order matches the order the user built it.                   | Plan   |
| Branching            | True tree — siblings render under a shared parent                            | Schema allows multiple children; rendering faithfully future-proofs intentional branching.                                | Plan   |
| Orphans              | Treated as new roots (the FK is already `ON DELETE SET NULL`)                | Zero extra logic — the DB already does this; no schema flag for "once had a parent" exists.                               | Plan   |
| Scale                | Fetch all, build tree in memory, no pagination                               | Matches what the flat list already does; the partial index handles lookups; v1 volume is a few hundred analyses per user. | Plan   |
| Search / filter      | None in this change                                                          | Keeps the change focused on tree shape; Cmd-F still works once a node is expanded.                                        | Plan   |
| UI assembly          | Native `<details>`/`<summary>` + Tailwind (no shadcn Collapsible, no island) | Matches the SSR-first disclosure pattern already on the detail page; zero hydration on a list that grows over time.       | Plan   |

## Scope

**In scope:**

- Rewrite the rendering on `/analyses` to a recursive tree of chain-roots
- Add a pure `buildAnalysisForest` helper in `src/lib/`
- Add a recursive `AnalysisTreeNode.astro` component using native `<details>`

**Out of scope:**

- Detail-page chain block, dashboard, any other surface
- Schema, API, or new indexes
- Search, filter, pagination, lazy loading
- Per-root expansion persistence (localStorage / URL state)
- shadcn Collapsible install or any new dependency
- Bulk chain actions, watched-company grouping

## Architecture / Approach

Single Supabase query returns the user's analyses with a six-column projection (including `parent_analysis_id`). A pure helper groups them into a forest in O(n), computes per-node subtree size and latest descendant timestamp via one bottom-up walk, and sorts. A recursive Astro component renders each root through `<details>` (when it has children) or a plain row (singleton), recursing into itself for descendants. No client JS — `<details>` open/close is browser-native.

## Phases at a Glance

| Phase                                            | What it delivers                                                                       | Key risk                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Tree-building helper + type                   | `buildAnalysisForest(rows)` returning sorted roots with subtree size + latest activity | Subtree sort key must be computed bottom-up after linking, not during the first pass       |
| 2. Recursive tree component + index page rewrite | `AnalysisTreeNode.astro` and a rewritten `analyses/index.astro` using the helper       | Title link vs chevron toggle must not nest (invalid HTML); chevron lives outside the `<a>` |

**Prerequisites:** S-02 (continue-analysis-chain) shipped — the data model the tree exposes already exists.
**Estimated effort:** Small — both phases together fit comfortably in one focused session.

## Open Risks & Assumptions

- **Assumption:** v1 user volumes stay in the low hundreds of analyses per user. If a user accumulates 1k+ analyses, the SSR payload bloats and pagination becomes worth revisiting.
- **Assumption:** Branching (parent with multiple children) is rare today, but the renderer handles it correctly so we don't have to revisit the component when it becomes common.
- **Risk:** Native `<details>` styling has minor cross-browser quirks (Safari's marker). The plan calls out the Tailwind utilities needed (`list-none`, `[&::-webkit-details-marker]:hidden`) so this is handled.

## Success Criteria (Summary)

- A user with chains can see them as collapsible groups on `/analyses`, with a `· N steps` badge on each root.
- A chain that was just continued bubbles to the top of the list on the next page load.
- Singletons, branches, and orphans all render correctly without special-case treatment by the user.
