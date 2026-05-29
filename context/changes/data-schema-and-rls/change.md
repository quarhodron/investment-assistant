---
change_id: data-schema-and-rls
roadmap_id: F-01
title: Multi-tenant data schema with per-user isolation (RLS)
status: planned
created: 2026-05-29
updated: 2026-05-29
---

# Change: data-schema-and-rls

## What

Foundation slice F-01 from `context/foundation/roadmap.md`. Stand up the Postgres schema for prompts, analyses (self-referencing for the continue-analysis chain, dual-linked to watched_companies), watched_companies, and user_settings — with Row-Level Security policies that enforce per-user isolation on every table and structural constraints that enforce FR-020 analysis immutability.

## Why

Every downstream slice (S-01 through S-08) depends on this foundation. RLS is the single most expensive thing to retrofit — the PRD's Access Control §Isolation guardrail and NFR §isolation explicitly say isolation cannot be relied on at the per-route layer. Doing the schema + RLS once, correctly, removes the burden from every future route handler.

## Refs

- Roadmap: `context/foundation/roadmap.md` § F-01
- PRD: `context/foundation/prd.md` (Access Control §Isolation, NFRs §isolation, FR-020, FR-006…FR-031)
- Plan: `context/changes/data-schema-and-rls/plan.md`
- Plan brief: `context/changes/data-schema-and-rls/plan-brief.md`
