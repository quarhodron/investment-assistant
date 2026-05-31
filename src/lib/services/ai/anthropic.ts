import Anthropic from "@anthropic-ai/sdk";
import type { StreamEvent } from "./index";

export default async function* streamAnthropic(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  input: string;
  context?: string;
}): AsyncGenerator<StreamEvent> {
  const client = new Anthropic({ apiKey: opts.apiKey });

  const parts = [`Topic: ${opts.input}`, `Instructions: ${opts.prompt}`];
  if (opts.context) parts.push(`Additional context: ${opts.context}`);
  const userContent = parts.join("\n\n");

  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: 4096,
    system: "You are a financial research assistant. Always respond in well-structured Markdown: use headings, bullet points, and bold text where appropriate.",
    messages: [{ role: "user", content: userContent }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
  });

  try {
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        yield { kind: "text", delta: event.delta.text };
      }
    }
  } finally {
    if (!stream.aborted) stream.abort();
  }

  const final = await stream.finalMessage();

  const citations: Anthropic.CitationsWebSearchResultLocation[] = [];
  let output = "";

  for (const block of final.content) {
    if (block.type === "text") {
      output += block.text;
      if (block.citations) {
        for (const c of block.citations) {
          if (c.type === "web_search_result_location") {
            citations.push(c);
          }
        }
      }
    }
  }

  yield {
    kind: "done",
    output,
    sources: { provider: "anthropic", items: citations },
    usage: {
      input_tokens: final.usage.input_tokens,
      output_tokens: final.usage.output_tokens,
      cost_usd: null,
    },
    model: final.model,
    provider: "anthropic",
  };
}
