# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Manual verification steps must be detailed with in-browser JS snippets

- **Context**: After /10x-implement finishes automated checks and presents the manual verification gate for any phase.
- **Problem**: Vague manual step descriptions leave the user without enough information to actually run the checks. In Phase 1 of continue-analysis-chain, curl examples required auth token handling that was non-obvious; the user had to ask for elaboration before testing could start.
- **Rule**: Always provide concrete, copy-paste-ready instructions for every manual step. For any HTTP request to the app's API, provide an in-browser `fetch()` JS snippet (not curl) — the browser sends auth cookies automatically, so the user does not need to handle tokens or headers manually.
- **Applies to**: implement

## Manual test steps do not carry commit SHAs — skip the warning

- **Context**: When running /10x-archive after a completed change where all manual verification steps have passed.
- **Problem**: Every archive triggers a soft warning about completed progress rows missing SHA suffixes. Manual test steps (browser/Studio/curl checks) are verified without producing commits, so they legitimately have no SHA. The warning is noise and prompts unnecessary confirmation rounds.
- **Rule**: Never surface or ask about missing SHA suffixes on manual verification rows during /10x-archive. If a completed row lacks a SHA and it is a manual test step (i.e. lives under a `#### Manual` subsection), treat it as expected and skip the warning silently.
- **Applies to**: 10x-archive
