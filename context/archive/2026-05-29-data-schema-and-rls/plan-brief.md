# Data Schema and RLS — Plan Brief

> Full plan: `context/changes/data-schema-and-rls/plan.md`

## What & Why

Stand up the multi-tenant Postgres schema (prompts, analyses, watched_companies, user_settings) with per-user RLS on every table and structural FR-020 immutability on `analyses`. This is roadmap slice F-01 — every downstream slice (S-01 through S-08) depends on this foundation. RLS-first removes the burden of per-route auth filtering and enforces the PRD's §Isolation guardrail at the data layer rather than the application layer, where the PRD explicitly says it cannot be relied on.

## Starting Point

`supabase/migrations/` is empty on disk. The Supabase SSR client and middleware are already wired (`src/lib/supabase.ts`, `src/middleware.ts`); `auth.users` is the canonical identity. There is no `src/types.ts` yet — this is the first slice that needs it.

## Desired End State

`npx supabase db reset` applies a single forward-only migration that creates all four tables with constraints, indexes, RLS policies, and a `BEFORE UPDATE` trigger on `analyses`. A typed `Database` flows through `createClient` so downstream slices get compiler-level isolation. A repeatable `supabase/tests/rls_smoke.sql` harness asserts cross-user invisibility and immutability rejection, runnable against any local stack.

## Key Decisions Made

| Decision                         | Choice                                                                                            | Why (1 sentence)                                                                                                                 | Source |
| -------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Prompt snapshot on `analyses`    | Inline `prompt_*_snapshot` columns + nullable `prompt_id` FK                                      | Survives prompt edit/delete by construction — FR-008/FR-009 cannot break FR-020.                                                 | Plan   |
| FR-020 immutability enforcement  | `BEFORE UPDATE` trigger on `analyses` that always raises                                          | Roadmap explicitly says schema-level constraints/triggers, not app layer; trigger holds against any client.                      | Plan   |
| `analyses.sources` shape         | `jsonb NOT NULL DEFAULT '[]'`                                                                     | Verbatim per FR-032 guardrail — provider shapes differ between Anthropic and OpenAI; JSONB stores both unchanged.                | Plan   |
| Ticker / exchange uniqueness     | `CHECK ((ticker IS NULL) = (exchange IS NULL))` + partial unique on `(user_id, exchange, ticker)` | Ticker is ambiguous without exchange (BMW XETRA ≠ pink-sheet BMWYY); deliberate refinement of PRD's "exchange optional" wording. | Plan   |
| Company-delete behavior (FR-027) | `analyses.company_id` ON DELETE SET NULL, no snapshot                                             | Preserves analyses per FR-027; the PRD does not require post-delete identifier rendering, so we don't denormalize.               | Plan   |
| `user_settings` shape            | One row per user (PK = user_id), `api_keys jsonb`, `default_model text`, `pgcrypto` enabled       | Encryption-agnostic: F-02 picks pgsodium / Worker-AES / other without a schema migration.                                        | Plan   |
| FR-033 cost columns              | Added now as nullable (`input_tokens`, `output_tokens`, `cost_usd`)                               | Avoids a future migration on an immutable table; aligns with the cost-visibility guardrail.                                      | Plan   |

## Scope

**In scope:**

- Four tables with constraints, indexes, RLS policies, immutability trigger
- Generated TypeScript types and typed `createClient`
- Repeatable RLS smoke script

**Out of scope:**

- API-key encryption mechanism (F-02)
- AI model variants registry (F-02 / S-01)
- Application logic, API routes, UI changes
- Password reset (S-09)
- Seed data

## Architecture / Approach

One forward-only migration, ordered: extensions → tables (FK order: prompts → watched_companies → user_settings → analyses) → triggers → RLS policies → indexes. Per-operation per-role policies use `(SELECT auth.uid()) = user_id` so Postgres caches the subquery once per statement. `analyses` carries a `parent_analysis_id` self-reference for the continue-analysis chain (S-02) and a nullable `company_id` for FR-026 dual-linking (S-06). Snapshot columns on `analyses` decouple immutable saved analyses from mutable `prompts` and `watched_companies` rows.

## Phases at a Glance

| Phase                          | What it delivers                                                                         | Key risk                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1. Schema + RLS + immutability | Migration file with tables, constraints, indexes, trigger, policies                      | Missing a policy on a table leaks rows cross-user — caught by Phase 3 smoke + manual Studio check                |
| 2. Generated types + client    | `Database` type wired through `src/lib/supabase.ts`; `src/types.ts` exports entity types | Type drift if a future migration is forgotten — convention: regenerate on every migration                        |
| 3. RLS verification harness    | `supabase/tests/rls_smoke.sql` runnable via `psql` against any local stack               | False sense of safety if assertions are silent on success — verified by the "comment out one policy" smoke check |

**Prerequisites:** Local Docker for `npx supabase start`. No prior schema state.
**Estimated effort:** ~1 session across 3 phases for a single-developer push.

## Open Risks & Assumptions

- **Assumption**: F-02 will accept `api_keys jsonb` as the column shape regardless of which encryption mechanism it picks. If F-02 picks pgsodium symmetric and prefers a typed column (`encrypted_text`), it can ALTER without breaking F-01's contract.
- **Risk**: Supabase migration tooling sometimes diffs locally-applied vs declared SQL on `db reset` if the file is later edited. Discipline: don't edit a committed migration; add a follow-up.
- **Assumption**: No CI-level Postgres yet, so the smoke script is a runbook artifact, not a gate. If the team adds a Supabase-in-CI later, the script can be promoted.

## Success Criteria (Summary)

- `npx supabase db reset` applies cleanly from empty.
- A user can never see, modify, or delete another user's rows on any of the four tables.
- Any `UPDATE` on `analyses` raises `cannot_modify_immutable_analysis` regardless of who runs it.
