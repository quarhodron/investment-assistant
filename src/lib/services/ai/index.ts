import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import streamAnthropic from "./anthropic";
import streamOpenAI from "./openai";

export type AnthropicCitation = Anthropic.CitationsWebSearchResultLocation;
export type OpenAIUrlCitation = OpenAI.Responses.ResponseTextOutput.URLCitation;

export type StoredSources =
  | { provider: "anthropic"; items: AnthropicCitation[] }
  | { provider: "openai"; items: OpenAIUrlCitation[] };

export type StreamEvent =
  | { kind: "text"; delta: string }
  | {
      kind: "done";
      output: string;
      sources: StoredSources;
      usage: { input_tokens: number | null; output_tokens: number | null; cost_usd: number | null };
      model: string;
      provider: "anthropic" | "openai";
    };

export interface RunAiAnalysisInput {
  provider: "anthropic" | "openai";
  model: string;
  prompt: string;
  context?: string;
  apiKey: string;
}

export async function* runAiAnalysis(opts: RunAiAnalysisInput): AsyncGenerator<StreamEvent> {
  if (opts.provider === "anthropic") {
    yield* streamAnthropic({ apiKey: opts.apiKey, model: opts.model, prompt: opts.prompt, context: opts.context });
  } else {
    yield* streamOpenAI({ apiKey: opts.apiKey, model: opts.model, prompt: opts.prompt, context: opts.context });
  }
}
