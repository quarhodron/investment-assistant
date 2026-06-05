import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { toSafeAiError } from "./errors";

function makeHeaders(): Headers {
  return new Headers([["request-id", "req-1"]]);
}

describe("toSafeAiError", () => {
  it("maps Anthropic API errors to anthropic_api_error", () => {
    const err = new Anthropic.APIError(429, { type: "rate_limit_error" }, "upstream failed", makeHeaders(), undefined);

    expect(toSafeAiError(err)).toEqual({
      status: 429,
      code: "rate_limit_error",
      message: "anthropic_api_error",
    });
  });

  it("maps OpenAI API errors to openai_api_error", () => {
    const err = new OpenAI.APIError(503, { code: "server_error" }, "upstream failed", makeHeaders());

    expect(toSafeAiError(err)).toEqual({
      status: 503,
      code: "server_error",
      message: "openai_api_error",
    });
  });

  it("maps unknown errors to unexpected_error", () => {
    expect(toSafeAiError(new Error("boom"))).toEqual({
      status: null,
      code: null,
      message: "unexpected_error",
    });
  });
});
