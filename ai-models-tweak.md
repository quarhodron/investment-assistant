# AI Models Tweak Notes for Financial Research

As of June 5, 2026, the OpenAI API gives you enough control to reproduce most of the useful "deep thinking" and "research" behaviors from the ChatGPT UI, but the controls are spread across model choice, tool choice, reasoning settings, and response formatting.

This note focuses on:

- what settings make sense to expose in a product UI
- what settings should stay developer-side
- what "deep thinking" means versus "deep research"
- what is specifically useful for financial analysis and investment research

## Core distinction

### Deep thinking

Deep thinking means the model spends more effort reasoning before answering. In the API, this is primarily:

- a reasoning-capable model like `gpt-5.5`
- `reasoning.effort` set to `low`, `medium`, `high`, or `xhigh`

This is best for:

- comparing companies
- reasoning about risks
- turning evidence into a thesis
- ranking scenarios
- writing an investment memo from already available information

It does not inherently mean the model goes to the internet.

### Deep research

Deep research is a tool-using workflow designed for large, multi-source investigations. In the API, this is primarily:

- `o4-mini-deep-research` or `o3-deep-research`
- at least one data source: `web_search`, `file_search`, or remote MCP
- often `background: true`

This is best for:

- broad market scans
- collecting and synthesizing many sources
- building a long report from public and private data
- research that benefits from browsing, retrieval, and code-based analysis

Important difference: the deep research API flow does not automatically ask clarifying questions first. If you want a clarification step, you need to build it yourself before starting the research run.

## Recommended user-facing controls

For a financial research product, the main UI should revolve around evidence quality, depth, and structure. It should not revolve around raw model knobs.

### 1. Research mode

Expose:

- `Answer only`
- `Web research`
- `Deep research`

Suggested mapping:

- `Answer only` -> no tools
- `Web research` -> `tools: [{ type: "web_search" }]`
- `Deep research` -> `model: "o4-mini-deep-research"` or `model: "o3-deep-research"`

Notes:

- if search must happen, use `tool_choice: "required"`
- if search is optional, use `tool_choice: "auto"`

This is one of the most important UI decisions because "use the internet" is more meaningful to users than "enable hosted tool calls."

### 2. Analysis depth

Expose:

- `Fast`
- `Balanced`
- `Thorough`
- `Maximum`

Suggested mapping:

- `Fast` -> `reasoning.effort: "low"`
- `Balanced` -> `reasoning.effort: "medium"`
- `Thorough` -> `reasoning.effort: "high"`
- `Maximum` -> `reasoning.effort: "xhigh"` for expensive cases only

This is the clean user-facing version of "deep thinking."

### 3. Source scope

Expose:

- `Public web only`
- `My files only`
- `Public web + my files`

Suggested mapping:

- public web -> `web_search`
- private docs -> `file_search` and/or MCP
- both -> both tool sources enabled

For finance, this matters a lot because users often want to combine:

- SEC filings
- earnings transcripts
- investor presentations
- internal memos
- prior analyses
- spreadsheets or valuation notes

### 4. Source policy

Expose:

- `Trusted sources only`
- `Open web`
- optional custom domain allowlist

For finance, domain restrictions are often more valuable than temperature control.

Examples of trusted-source presets:

- `Regulatory`: `sec.gov`, `investor.gov`, `federalreserve.gov`, `ecb.europa.eu`
- `Company filings`: IR domains and exchanges
- `Macro data`: FRED, BLS, Census, OECD, IMF, World Bank
- `Healthcare / biotech`: FDA, EMA, PubMed, clinicaltrials.gov

This should map to web-search filters and allowed domains.

### 5. Freshness / live internet

Expose:

- `Live web`
- `Cached/indexed only`

Suggested mapping:

- live web -> `external_web_access: true`
- cached/indexed only -> `external_web_access: false`

This is useful when the user wants either:

- the latest possible market-moving information, or
- a more reproducible answer that does not depend on live fetching

### 6. Output shape

Expose:

- `Brief summary`
- `Investment memo`
- `Bull / bear case`
- `Company comparison`
- `Risk register`
- `JSON export`

For normal GPT-5 style responses, use Structured Outputs so the app receives stable machine-readable fields.

Example output schema sections:

- thesis
- key drivers
- catalysts
- risks
- valuation notes
- evidence table
- confidence

Important limitation:

- deep research models do not support Structured Outputs directly
- best pattern: run deep research first, then pass the result into `gpt-5.5` for strict JSON formatting

### 7. Citations and evidence visibility

Expose:

- `Show inline citations`
- `Show all consulted sources`
- `Show evidence table`

This is essential for finance. A user should be able to inspect:

- what claims were made
- which sources support them
- which URLs were consulted

The API supports both inline citations and the full `sources` list.

### 8. Cost / time budget

Expose:

- `Fast / low cost`
- `Balanced`
- `Best available`

Users understand this better than tokens.

Suggested mapping:

- `Fast / low cost` -> smaller model, lower reasoning, less search depth
- `Balanced` -> `gpt-5.5` or `o4-mini-deep-research`
- `Best available` -> more reasoning, more search budget, possibly `o3-deep-research`

For deep research, you can also vary:

- `max_tool_calls`
- model choice
- whether background mode is enabled

## Settings that should usually stay out of the user UI

These are usually developer or admin settings:

- `temperature`
- `top_p`
- `parallel_tool_calls`
- `store`
- `prompt_cache_key`
- `prompt_cache_retention`
- `safety_identifier`
- `service_tier`
- `truncation`
- `top_logprobs`

### Why temperature is usually the wrong main knob

For financial analysis, users usually want:

- stronger evidence
- clearer reasoning
- better source control
- more reliable structure

They usually do not want stylistic randomness.

If you expose temperature at all, put it under an Advanced section and rename it to something user-facing like:

- `Creativity`

But in most finance products I would hide it completely.

## Settings that do make sense in an Advanced UI

If you want an advanced settings drawer, these three are reasonable:

### 1. Verbosity

Map to `text.verbosity`:

- `low`
- `medium`
- `high`

This is useful because it controls answer length without implying more or less intelligence.

### 2. Search requirement

Expose:

- `Search when useful`
- `Always search`

Map to:

- `tool_choice: "auto"`
- `tool_choice: "required"`

This is especially useful in finance because many users will assume "research" means search is guaranteed.

### 3. Evidence strictness

Expose:

- `Allow answer with partial evidence`
- `Require citations for material claims`

This is mostly a prompt / policy-layer control rather than a single API flag, but it is valuable.

For a financial app, the system instructions should define what counts as a material claim:

- revenue growth
- margins
- valuation multiples
- guidance changes
- debt levels
- regulatory events

## Best UI presets for a financial research product

I would ship presets instead of asking users to assemble raw settings.

### Quick analysis

Use when the user wants a fast take.

Suggested behavior:

- model: `gpt-5.5`
- reasoning: `low`
- no search unless explicitly requested
- verbosity: `low` or `medium`

### Analyst mode

Use when the user wants a stronger, sourced answer.

Suggested behavior:

- model: `gpt-5.5`
- reasoning: `medium` or `high`
- `web_search` enabled
- `tool_choice: "required"` if the answer must be externally grounded
- citations visible

### Deep research

Use when the user wants a serious report.

Suggested behavior:

- model: `o4-mini-deep-research`
- `background: true`
- data sources: web + file search as needed
- citations and source list visible

### Premium deep research

Use when the user wants the strongest long-form research pass and accepts cost and latency.

Suggested behavior:

- model: `o3-deep-research`
- `background: true`
- broader search budget
- possibly code interpreter enabled for numerical analysis

## Finance-specific product guidance

If your product touches "what is good to invest in right now", the most useful user inputs are not model settings. They are research constraints.

I would require or strongly encourage:

- objective
- time horizon
- risk tolerance
- geography / tax regime
- asset classes allowed
- liquidity constraints
- ethical / sector exclusions
- whether the output is:
  - research only
  - ranked watchlist
  - recommendation draft

Without these, a "best investment right now" answer is too underspecified to be trustworthy.

## Safety and trust controls that matter for finance

These should be developer-enforced even if not user-visible.

### 1. Show evidence for claims

Every material claim should be attributable to:

- a citation
- a company filing
- a macro/statistics source
- or a user-provided document

### 2. Separate public-web research from private-data analysis

When sensitive data is involved, use staged workflows:

1. public-web research
2. private-data analysis in a second pass

This reduces the risk of data leakage through prompt injection or tool misuse.

### 3. Restrict trusted data sources

Only connect trusted MCP servers and trusted vector-store contents.

### 4. Keep tool logs

Log:

- what tools were called
- which URLs were consulted
- what files were read
- what citations were shown to the user

For research products, this is useful for trust, debugging, and audits.

## Practical API notes

### Responses API controls worth using

- `reasoning.effort`
- `text.verbosity`
- `tool_choice`
- `max_tool_calls`
- `background`
- `text.format` with `json_schema` for structured outputs

### Web search controls worth using

- `filters`
- `external_web_access`
- `search_context_size`
- `return_token_budget`
- `user_location` when local context matters

### Deep research limitations worth designing around

- requires at least one data source
- best run with `background: true`
- does not ask clarifying questions for you
- does not support function calling
- does not support structured outputs directly

## Recommended default architecture

If building a finance assistant today, I would structure it like this:

1. Intake step
   - gather investor intent and constraints

2. Mode selection
   - quick analysis
   - analyst mode
   - deep research

3. Evidence gathering
   - web search and/or files and/or MCP

4. Analysis pass
   - reasoning model or deep research model

5. Formatting pass
   - optional `gpt-5.5` JSON-schema formatting step for app consumption

6. UI rendering
   - memo
   - comparison table
   - evidence table
   - source list

This gives a cleaner product than exposing every raw parameter directly.

## Recommended UI vs developer split

### Show in main UI

- research mode
- depth
- source scope
- source policy
- freshness / live internet
- output shape
- citations / sources
- cost / time budget

### Show in advanced UI

- verbosity
- force search
- evidence strictness
- optional creativity / temperature

### Keep developer-side

- top_p
- cache keys
- safety identifiers
- service tier
- parallel tool calls
- truncation
- top logprobs

## Useful official references

- Responses API reference: `https://developers.openai.com/api/reference/resources/responses/methods/create`
- Reasoning guide: `https://developers.openai.com/api/docs/guides/reasoning`
- GPT-5.5 guide: `https://developers.openai.com/api/docs/guides/latest-model`
- Web search guide: `https://developers.openai.com/api/docs/guides/tools-web-search`
- Deep research guide: `https://developers.openai.com/api/docs/guides/deep-research`
- Structured outputs guide: `https://developers.openai.com/api/docs/guides/structured-outputs`
- Reasoning best practices: `https://developers.openai.com/api/docs/guides/reasoning-best-practices`

## Bottom line

For financial research, the highest-value user controls are not classic LLM sampling knobs. The best controls are:

- whether to search
- how deeply to reason
- which sources are allowed
- whether live internet is allowed
- how the answer must be structured
- how visible and strict the evidence should be

That is the right product abstraction for this domain.
