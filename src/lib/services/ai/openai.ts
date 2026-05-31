import OpenAI from "openai";
import type { StreamEvent } from "./index";

export default async function* streamOpenAI(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  context?: string;
}): AsyncGenerator<StreamEvent> {
  const client = new OpenAI({ apiKey: opts.apiKey });

  const input = opts.context ? `${opts.context}\n\n${opts.prompt}` : opts.prompt;

  const stream = await client.responses.create({
    model: opts.model,
    input,
    tools: [{ type: "web_search_preview" }],
    stream: true,
  });

  const citations: OpenAI.Responses.ResponseTextOutput.URLCitation[] = [];
  let output = "";
  let usage: { input_tokens: number | null; output_tokens: number | null } = {
    input_tokens: null,
    output_tokens: null,
  };

  try {
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") {
        output += event.delta;
        yield { kind: "text", delta: event.delta };
      } else if (event.type === "response.output_text.annotation.added") {
        const ann = event.annotation;
        if (
          ann !== null &&
          typeof ann === "object" &&
          "type" in ann &&
          (ann as { type: string }).type === "url_citation"
        ) {
          citations.push(ann as OpenAI.Responses.ResponseTextOutput.URLCitation);
        }
      } else if (event.type === "response.completed") {
        usage = {
          input_tokens: event.response.usage?.input_tokens ?? null,
          output_tokens: event.response.usage?.output_tokens ?? null,
        };
      }
    }
  } finally {
    stream.controller.abort();
  }

  yield {
    kind: "done",
    output,
    sources: { provider: "openai", items: citations },
    usage: { ...usage, cost_usd: null },
    model: opts.model,
    provider: "openai",
  };
}
