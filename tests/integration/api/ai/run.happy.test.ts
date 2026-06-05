import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/ai/run";
import type { AnalysisInsert } from "@/types";
import { mockDecryptApiKey, mockRunAiAnalysis } from "../../_harness/ai-stub";
import { buildApiContext } from "../../_harness/api-context";
import { parseSseFrames } from "../../_harness/sse";
import { createSupabaseStub, type SupabaseStub } from "../../_harness/supabase-stub";

interface MockState {
  currentSupabase: SupabaseStub | null;
  runController: ReturnType<typeof mockRunAiAnalysis> | null;
  decryptController: ReturnType<typeof mockDecryptApiKey> | null;
  createClientMock: ReturnType<typeof vi.fn>;
  runAiAnalysisMock: ReturnType<typeof vi.fn>;
  decryptApiKeyMock: ReturnType<typeof vi.fn>;
}

const hoisted: MockState = vi.hoisted(() => ({
  currentSupabase: null,
  runController: null,
  decryptController: null,
  createClientMock: vi.fn(),
  runAiAnalysisMock: vi.fn(),
  decryptApiKeyMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: hoisted.createClientMock,
}));

vi.mock("@/lib/services/ai", () => ({
  runAiAnalysis: hoisted.runAiAnalysisMock,
}));

vi.mock("@/lib/services/api-key-crypto", () => ({
  decryptApiKey: hoisted.decryptApiKeyMock,
}));

const validBody = {
  provider: "anthropic" as const,
  model_id: "claude-3-7-sonnet",
  prompt_body: "Summarize the filing",
  prompt_name: "Filing summary",
  prompt_description: "Turn the filing into a short digest",
  input: "Apple Q1 earnings",
  title: "Apple earnings summary",
  prompt_id: "prompt-1",
  extra_context: "Recent performance context",
  subject: "AAPL",
  parent_analysis_id: "parent-1",
  company_id: "company-1",
};

const doneEvent = {
  kind: "done" as const,
  output: "Final analysis output",
  sources: { provider: "anthropic" as const, items: [] },
  usage: { input_tokens: 120, output_tokens: 340, cost_usd: null },
  model: "claude-3-7-sonnet-20250219",
  provider: "anthropic" as const,
};

function getRunController(): ReturnType<typeof mockRunAiAnalysis> {
  if (!hoisted.runController) {
    throw new Error("run_controller_not_initialized");
  }
  return hoisted.runController;
}

function getDecryptController(): ReturnType<typeof mockDecryptApiKey> {
  if (!hoisted.decryptController) {
    throw new Error("decrypt_controller_not_initialized");
  }
  return hoisted.decryptController;
}

function buildSupabaseStub(): SupabaseStub {
  return createSupabaseStub({
    user_settings: () => ({
      data: { api_keys: { anthropic: { encrypted: true } } },
      error: null,
    }),
    ai_models: () => ({ data: { id: validBody.model_id }, error: null }),
    analyses: (query) => {
      if (query.op === "insert") {
        return { data: { id: "analysis-1" }, error: null };
      }
      return { data: { output: "PARENT_OUT_1" }, error: null };
    },
  });
}

describe("POST /api/ai/run happy path", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.currentSupabase = buildSupabaseStub();
    hoisted.runController = mockRunAiAnalysis();
    hoisted.decryptController = mockDecryptApiKey();

    hoisted.createClientMock.mockImplementation(() => hoisted.currentSupabase);
    hoisted.runAiAnalysisMock.mockImplementation(
      (opts: Parameters<ReturnType<typeof mockRunAiAnalysis>["implementation"]>[0]) =>
        getRunController().implementation(opts),
    );
    hoisted.decryptApiKeyMock.mockImplementation(
      (...args: Parameters<ReturnType<typeof mockDecryptApiKey>["implementation"]>) =>
        getDecryptController().implementation(...args),
    );

    getRunController().setEvents([{ kind: "text", delta: "partial output" }, doneEvent]);
  });

  it("streams delta and done frames, then persists the completed analysis snapshot", async () => {
    const response = await POST(buildApiContext({ body: validBody }));
    const frames = await parseSseFrames(response);

    expect(response.status).toBe(200);
    expect(frames).toEqual([
      { event: "delta", data: "partial output" },
      {
        event: "done",
        data: {
          analysis_id: "analysis-1",
          sources: doneEvent.sources,
          usage: doneEvent.usage,
          model: doneEvent.model,
          provider: doneEvent.provider,
        },
      },
    ]);

    expect(hoisted.currentSupabase?.insertCalls).toHaveLength(1);

    const row = hoisted.currentSupabase?.insertCalls[0]?.row as AnalysisInsert | undefined;
    expect(row).toMatchObject({
      prompt_body_snapshot: validBody.prompt_body,
      prompt_name_snapshot: validBody.prompt_name,
      input: validBody.input,
      output: doneEvent.output,
      provider: validBody.provider,
      model: doneEvent.model,
    });
  });
});
