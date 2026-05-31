# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Manual test steps do not carry commit SHAs — skip the warning

- **Context**: When running /10x-archive after a completed change where all manual verification steps have passed.
- **Problem**: Every archive triggers a soft warning about completed progress rows missing SHA suffixes. Manual test steps (browser/Studio/curl checks) are verified without producing commits, so they legitimately have no SHA. The warning is noise and prompts unnecessary confirmation rounds.
- **Rule**: Never surface or ask about missing SHA suffixes on manual verification rows during /10x-archive. If a completed row lacks a SHA and it is a manual test step (i.e. lives under a `#### Manual` subsection), treat it as expected and skip the warning silently.
- **Applies to**: 10x-archive
