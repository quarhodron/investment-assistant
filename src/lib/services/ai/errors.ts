import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export interface SafeAiError {
  status: number | null;
  code: string | null;
  message: string;
}

export function toSafeAiError(err: unknown): SafeAiError {
  if (err instanceof Anthropic.APIError) {
    const errBody: unknown = err.error as unknown;
    const code =
      errBody !== null &&
      errBody !== undefined &&
      typeof errBody === "object" &&
      "type" in errBody &&
      typeof (errBody as Record<string, unknown>).type === "string"
        ? String((errBody as Record<string, unknown>).type)
        : null;
    const status = (err.status as number | undefined) ?? null;
    return { status, code, message: "anthropic_api_error" };
  }
  if (err instanceof OpenAI.APIError) {
    const status = (err.status as number | undefined) ?? null;
    const code = err.code ?? null;
    return { status, code, message: "openai_api_error" };
  }
  return { status: null, code: null, message: "unexpected_error" };
}
