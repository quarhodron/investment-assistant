<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Data Schema and RLS (F-01) — RETROSPECTIVE

- **Plan**: context/changes/data-schema-and-rls/plan.md
- **Mode**: Deep (retrospective — plan already shipped)
- **Date**: 2026-05-29
- **Verdict**: REVISE (retrospective; informs future similar plans)
- **Findings**: 0 critical · 4 warnings · 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓, 3/3 symbols ✓, Progress↔Phase 21/21 ✓, brief↔plan ✓.

## Findings

### F1 — user_settings row lifecycle unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Blind Spots
- **Location**: Phase 1 — user_settings; Critical Implementation Details
- **Detail**: Plan never says who creates the user_settings row. F-02/S-01 will hit a missing row on first read and race on first concurrent writes (PK conflict).
- **Decision**: ALREADY-CAPTURED — same issue as impl-review F3, queued in `follow-ups/review-fixes.md` for F-02.

### F2 — Phase 3 contract missing the INSERT spoof attack

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — RLS smoke script (Contract step 3)
- **Detail**: Contract enumerated SELECT/UPDATE/DELETE cross-user invisibility but missed INSERT WITH CHECK spoof verification.
- **Decision**: ALREADY-FIXED — caught by impl-review F1 and patched into `rls_smoke.sql` (commit 77b0406).

### F3 — Plan revokes anon but doesn't specify GRANT to authenticated

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — RLS policies bullet
- **Detail**: Plan tells implementer to revoke anon but says nothing about explicit GRANTs to authenticated; relies silently on Supabase instance defaults.
- **Decision**: ALREADY-FIXED — caught by impl-review F5 and added to migration (commit 77b0406).

### F4 — JWT claim path in Phase 3 contract is the wrong shape

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: plan.md Phase 3 Contract — "SET LOCAL request.jwt.claim.sub = '<user-id>'"
- **Detail**: Supabase's `auth.uid()` reads JSON setting `request.jwt.claims` (`->> 'sub'`), not the dotted singular `request.jwt.claim.sub`. A literal-minded implementer would set a setting auth.uid() never reads → all assertions silently pass for the wrong reason. Implementation got it right; plan text drifts.
- **Fix**: Replace plan text with `SET LOCAL "request.jwt.claims" = '{"sub":"<user-id>","role":"authenticated"}'`.
- **Decision**: FIXED — plan text aligned with the JSON-claims form.

### F5 — "Compiler-level isolation guarantees for free" overpromises

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: plan.md Overview
- **Detail**: TS types make `.from('analyses').update()` compile cleanly — only the DB trigger rejects at runtime. Calling that "isolation guarantees" could nudge a future reader to skip integration coverage.
- **Fix**: Reword to "compiler-level row typing matching the schema". Drop "isolation".
- **Decision**: FIXED — wording softened.

### F6 — Six indexes built upfront for slices that don't exist

- **Severity**: 📝 OBSERVATION
- **Impact**: 🔎 MEDIUM
- **Dimension**: Lean Execution
- **Location**: plan.md Phase 1 — Indexes bullet
- **Detail**: Six indexes each justified by an unbuilt S-\* slice. None of those slices' query plans are locked. analyses is "immutable-but-frequently-inserted" — every speculative index pays write-amp on every insert forever. Also: `analyses_user_created_idx` is fully covered by the prefix of `analyses_user_type_created_idx`.
- **Decision**: SKIPPED — pure plan edit would create plan↔code drift (indexes already exist in the live migration). Re-evaluating would need a follow-up migration. Not a documentation-only fix.

### F7 — analyses.subject column shape underspecified

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Plan Completeness
- **Location**: plan.md Phase 1 — analyses contract, "subject text"
- **Detail**: subject described as "free-text topic for 'other', free-text ticker/name for unwatched-company per FR-014" but nullable with no required-vs-optional rule. S-01/S-03 will have to guess.
- **Fix**: Note in the plan contract that S-01 owns subject population semantics; column is intentionally nullable to support FR-027's preserved-after-company-delete case.
- **Decision**: FIXED — plan contract clarified.

### F8 — No CI gate for schema/RLS regressions

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Blind Spots
- **Location**: plan.md Phase 3 (Intent paragraph) and brief Open Risks
- **Detail**: A future migration that silently drops one of four RLS policies on a table breaks isolation; lint and build pass; nobody notices until someone runs the smoke script by hand.
- **Fix**: Add a "What We're NOT Doing" entry deferring CI gate promotion explicitly, with the operational rule (run the smoke script before any migration PR).
- **Decision**: FIXED — added explicit deferral and pre-merge runbook step to plan.
