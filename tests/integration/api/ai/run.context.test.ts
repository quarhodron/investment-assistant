import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/ai/run";
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
  prompt_body: "P2",
  prompt_name: "Continue analysis",
  input: "I2",
  title: "Child analysis",
};

const doneEvent = {
  kind: "done" as const,
  output: "child-output",
  sources: { provider: "anthropic" as const, items: [] },
  usage: { input_tokens: 10, output_tokens: 20, cost_usd: null },
  model: validBody.model_id,
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

function buildSupabaseStub(parentOutput = "PARENT_OUT_1"): SupabaseStub {
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

      return {
        data: {
          output: parentOutput,
          prompt_body_snapshot: "P1_NEVER_PASSED",
          input: "I1_NEVER_PASSED",
        },
        error: null,
      };
    },
  });
}

describe("POST /api/ai/run continue-analysis context composition", () => {
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

    getRunController().setEvents([doneEvent]);
  });

  it("passes the immediate parent output as context without leaking parent prompt or input", async () => {
    const response = await POST(
      buildApiContext({
        body: { ...validBody, parent_analysis_id: "p1" },
      }),
    );

    await parseSseFrames(response);

    expect(getRunController().capturedOpts).toMatchObject({
      prompt: "P2",
      input: "I2",
      context: "PARENT_OUT_1",
    });
    expect(getRunController().capturedOpts?.prompt).not.toContain("P1_NEVER_PASSED");
    expect(getRunController().capturedOpts?.input).not.toContain("I1_NEVER_PASSED");
  });

  it("appends extra_context after the parent output with a blank line separator", async () => {
    const response = await POST(
      buildApiContext({
        body: { ...validBody, parent_analysis_id: "p1", extra_context: "EXTRA" },
      }),
    );

    await parseSseFrames(response);

    expect(getRunController().capturedOpts).toMatchObject({
      prompt: "P2",
      input: "I2",
      context: "PARENT_OUT_1\n\nEXTRA",
    });
  });

  it("uses only the immediate parent's output for a depth-2 continue-analysis run", async () => {
    hoisted.currentSupabase = buildSupabaseStub("CHILD_OUT");
    hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);

    const response = await POST(
      buildApiContext({
        body: { ...validBody, parent_analysis_id: "child-id" },
      }),
    );

    await parseSseFrames(response);

    expect(getRunController().capturedOpts).toMatchObject({
      prompt: "P2",
      input: "I2",
      context: "CHILD_OUT",
    });
    expect(getRunController().capturedOpts?.context).not.toContain("PARENT_OUT_1");
  });

  it("passes extra_context directly when there is no parent analysis", async () => {
    const response = await POST(
      buildApiContext({
        body: { ...validBody, extra_context: "ONLY_EXTRA" },
      }),
    );

    await parseSseFrames(response);

    expect(getRunController().capturedOpts).toMatchObject({
      prompt: "P2",
      input: "I2",
      context: "ONLY_EXTRA",
    });
  });
});
