# Dashboard: Watched-Companies Stat & Remove Workspace Aside — Plan Brief

> Full plan: `context/changes/dashboard-recent/plan.md`

## What & Why

Two small dashboard tweaks: surface how many companies the user is watching as a top-row metric, and remove the right-hand "Workspace" sidebar (setup checklist + quick links) that duplicates navigation the Topbar already provides. The result is a cleaner dashboard with one more useful at-a-glance number and a full-width recent-research column.

## Starting Point

The dashboard (`src/pages/dashboard.astro`) is a single server-rendered Astro page. It shows a four-tile stat row (Analyses total / This week / Prompts / API keys) and a two-column body: "Recent research" (last 5 analyses) plus a "Workspace" aside with a setup checklist and quick-action links. All data is fetched in one `Promise.all` in the frontmatter.

## Desired End State

The stat row shows five tiles in a single row — Analyses · total, This week, Prompts · saved, **Watchlist**, API keys — where Watchlist is the user's watched-company count with a green dot when above zero. The Workspace aside is gone and Recent research spans the full content width. Navigation is unaffected (the Topbar already carries it).

## Key Decisions Made

| Decision                      | Choice                                          | Why (1 sentence)                                                        | Source |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- | ------ |
| What "dashboard-recent" means | Add watchlist stat + remove aside               | User clarified the actual ask; a recent-analyses widget already exists. | Plan   |
| Stat-row layout               | `lg:grid-cols-5` (single row)                   | Keeps the existing one-row feel with the new fifth tile.                | Plan   |
| Removed quick links           | Drop entirely                                   | Topbar already provides full nav + a "New analysis" CTA.                | Plan   |
| Watchlist tile copy           | Label "Watchlist", suffix "cos", accent when >0 | Compact wording that fits the narrower five-column tiles.               | Plan   |

## Scope

**In scope:** one watched-companies count query; one new stat tile; stat grid → 5 columns; delete the aside; make Recent research full-width.

**Out of scope:** date/locale changes (`en-GB`→`pl-PL`), schema/migrations, new indexes, watchlist page or API changes, relocating any links.

## Architecture / Approach

Single-file edit to `dashboard.astro`: add a `count`/`head` query for `watched_companies` to the existing `Promise.all`, insert the tile object into the stat array, bump the grid column count, and delete the aside block while collapsing the two-column wrapper to full-width.

## Phases at a Glance

| Phase                                          | What it delivers                            | Key risk                                                                                              |
| ---------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1. Add Watchlist stat & remove Workspace aside | Five-tile stat row + full-width recent list | Mis-aligning the `Promise.all` destructuring order; leftover layout remnants after removing the aside |

**Prerequisites:** none (existing patterns + working dashboard).
**Estimated effort:** ~1 short session, single file, one phase.

## Open Risks & Assumptions

- Assumes the Topbar adequately replaces the aside's links (verified: it does).
- A row of five tiles on a 2-wide mobile grid leaves the fifth tile alone in its row — accepted as fine.

## Success Criteria (Summary)

- Dashboard shows five tiles in the agreed order with a correct, live-updating Watchlist count.
- The Workspace aside is gone and Recent research is full-width, with navigation intact via the Topbar.
- `npm run lint` and `npm run build` pass.
