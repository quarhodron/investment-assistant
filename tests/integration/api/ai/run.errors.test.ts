import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/ai/run";
import { mockDecryptApiKey, mockRunAiAnalysis } from "../../_harness/ai-stub";
import { buildApiContext } from "../../_harness/api-context";
import { parseSseFrames } from "../../_harness/sse";
import {
  createNullSupabaseStub,
  createSupabaseStub,
  type SupabaseStub,
  type TableHandler,
} from "../../_harness/supabase-stub";

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
  input: "Apple Q1 earnings",
  title: "Apple earnings summary",
};

function makeHeaders(): Headers {
  return new Headers([["request-id", "req-1"]]);
}

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

function createAnthropicApiError(): InstanceType<typeof Anthropic.APIError> {
  return new Anthropic.APIError(429, { type: "rate_limit_error" }, "upstream failed", makeHeaders(), undefined);
}

function createOpenAiApiError(): InstanceType<typeof OpenAI.APIError> {
  return new OpenAI.APIError(503, { code: "server_error" }, "upstream failed", makeHeaders());
}

function buildDefaultSupabaseStub(): SupabaseStub {
  const defaultTableHandler: TableHandler = (query) => {
    if (query.op === "insert") {
      return { data: { id: "analysis-1" }, error: null };
    }

    if (query.cols === "api_keys") {
      return {
        data: {
          api_keys: {
            anthropic: { encrypted: true },
            openai: { encrypted: true },
          },
        },
        error: null,
      };
    }

    if (query.cols === "id") {
      const id = query.filters.id;
      return { data: { id: typeof id === "string" ? id : "model-1" }, error: null };
    }

    if (query.cols === "output") {
      return { data: { output: "PARENT_OUT" }, error: null };
    }

    return { data: null, error: null };
  };

  return createSupabaseStub({
    user_settings: defaultTableHandler,
    ai_models: defaultTableHandler,
    analyses: defaultTableHandler,
  });
}

function buildMalformedJsonContext() {
  const context = buildApiContext({ body: validBody });
  return {
    ...context,
    request: new Request("https://app.local/api/ai/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    }),
  };
}

interface Scenario {
  name: string;
  setup(): ReturnType<typeof buildApiContext> | ReturnType<typeof buildMalformedJsonContext>;
  expectedStatus: number;
  expectedMessage?: string;
  expectedDetail?: string;
  expectInsertCalls: number;
  expectBodyText?: string;
}

describe("POST /api/ai/run error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.currentSupabase = buildDefaultSupabaseStub();
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
  });

  it.each<Scenario>([
    {
      name: "rejects cross-origin requests before streaming",
      setup() {
        return buildApiContext({
          body: validBody,
          headers: { Origin: "https://evil.example" },
        });
      },
      expectedStatus: 403,
      expectedMessage: "forbidden",
      expectInsertCalls: 0,
    },
    {
      name: "returns 401 when the user is not authenticated",
      setup() {
        const context = buildApiContext({ body: validBody });
        return { ...context, locals: { ...context.locals, user: null } };
      },
      expectedStatus: 401,
      expectBodyText: "",
      expectInsertCalls: 0,
    },
    {
      name: "reports supabase_unavailable when the client cannot be created",
      setup() {
        hoisted.currentSupabase = createNullSupabaseStub();
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 503,
      expectedMessage: "supabase_unavailable",
      expectInsertCalls: 0,
    },
    {
      name: "reports invalid_body when the request JSON cannot be parsed",
      setup() {
        return buildMalformedJsonContext();
      },
      expectedStatus: 400,
      expectedMessage: "invalid_body",
      expectInsertCalls: 0,
    },
    {
      name: "reports invalid_input when validation fails",
      setup() {
        return buildApiContext({
          body: { ...validBody, title: "" },
        });
      },
      expectedStatus: 400,
      expectedMessage: "invalid_input",
      expectedDetail: "title_required",
      expectInsertCalls: 0,
    },
    {
      name: "reports settings_unavailable when the user settings query fails",
      setup() {
        hoisted.currentSupabase = createSupabaseStub({
          user_settings: () => ({ data: null, error: { code: "read_failed" } }),
          ai_models: () => ({ data: { id: validBody.model_id }, error: null }),
          analyses: () => ({ data: { id: "analysis-1" }, error: null }),
        });
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "settings_unavailable",
      expectInsertCalls: 0,
    },
    {
      name: "reports api_key_not_configured when the provider key is missing",
      setup() {
        hoisted.currentSupabase = createSupabaseStub({
          user_settings: () => ({ data: { api_keys: {} }, error: null }),
          ai_models: () => ({ data: { id: validBody.model_id }, error: null }),
          analyses: () => ({ data: { id: "analysis-1" }, error: null }),
        });
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "api_key_not_configured",
      expectInsertCalls: 0,
    },
    {
      name: "reports models_unavailable when the model lookup fails",
      setup() {
        hoisted.currentSupabase = createSupabaseStub({
          user_settings: () => ({
            data: { api_keys: { anthropic: { encrypted: true } } },
            error: null,
          }),
          ai_models: () => ({ data: null, error: { code: "model_lookup_failed" } }),
          analyses: () => ({ data: { id: "analysis-1" }, error: null }),
        });
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "models_unavailable",
      expectInsertCalls: 0,
    },
    {
      name: "reports invalid_model when the selected model is missing or disabled",
      setup() {
        hoisted.currentSupabase = createSupabaseStub({
          user_settings: () => ({
            data: { api_keys: { anthropic: { encrypted: true } } },
            error: null,
          }),
          ai_models: () => ({ data: null, error: null }),
          analyses: () => ({ data: { id: "analysis-1" }, error: null }),
        });
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "invalid_model",
      expectInsertCalls: 0,
    },
    {
      name: "reports api_key_corrupted when decryption returns decrypt_failed",
      setup() {
        getDecryptController().setError(new Error("decrypt_failed"));
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "api_key_corrupted",
      expectInsertCalls: 0,
    },
    {
      name: "reports decryption_unavailable when decryption fails unexpectedly",
      setup() {
        getDecryptController().setError(new Error("kms_unavailable"));
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "decryption_unavailable",
      expectInsertCalls: 0,
    },
    {
      name: "reports parent_not_found when the parent analysis lookup fails",
      setup() {
        hoisted.currentSupabase = createSupabaseStub({
          user_settings: () => ({
            data: { api_keys: { anthropic: { encrypted: true } } },
            error: null,
          }),
          ai_models: () => ({ data: { id: validBody.model_id }, error: null }),
          analyses: (query) => {
            if (query.op === "select" && query.cols === "output") {
              return { data: null, error: { code: "parent_missing" } };
            }
            return { data: { id: "analysis-1" }, error: null };
          },
        });
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        return buildApiContext({
          body: { ...validBody, parent_analysis_id: "parent-1" },
        });
      },
      expectedStatus: 200,
      expectedMessage: "parent_not_found",
      expectInsertCalls: 0,
    },
    {
      name: "reports anthropic_api_error when the provider stream throws",
      setup() {
        getRunController().setError(createAnthropicApiError());
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "anthropic_api_error",
      expectInsertCalls: 0,
    },
    {
      name: "reports openai_api_error when the provider stream throws an OpenAI API error",
      setup() {
        getRunController().setError(createOpenAiApiError());
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "openai_api_error",
      expectInsertCalls: 0,
    },
    {
      name: "reports unexpected_error when the provider stream throws an unknown error",
      setup() {
        getRunController().setError(new Error("provider_network_timeout"));
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "unexpected_error",
      expectInsertCalls: 0,
    },
    {
      name: "reports persist_failed when the insert returns no row",
      setup() {
        hoisted.currentSupabase = createSupabaseStub({
          user_settings: () => ({
            data: { api_keys: { anthropic: { encrypted: true } } },
            error: null,
          }),
          ai_models: () => ({ data: { id: validBody.model_id }, error: null }),
          analyses: (query) => {
            if (query.op === "insert") {
              return { data: null, error: { code: "23505" } };
            }
            return { data: { id: "analysis-1" }, error: null };
          },
        });
        hoisted.createClientMock.mockReturnValue(hoisted.currentSupabase);
        getRunController().setEvents([
          { kind: "text", delta: "partial output" },
          {
            kind: "done",
            output: "analysis body",
            sources: { provider: "anthropic", items: [] },
            usage: { input_tokens: 10, output_tokens: 20, cost_usd: null },
            model: validBody.model_id,
            provider: "anthropic",
          },
        ]);
        return buildApiContext({ body: validBody });
      },
      expectedStatus: 200,
      expectedMessage: "persist_failed",
      expectInsertCalls: 1,
    },
  ])("$name", async (scenario) => {
    const { expectedStatus, expectedMessage, expectedDetail, expectInsertCalls, expectBodyText } = scenario;
    const context = scenario.setup();
    const response = await POST(context);

    expect(response.status).toBe(expectedStatus);

    if (expectedMessage === undefined) {
      await expect(response.text()).resolves.toBe(expectBodyText ?? "");
    } else {
      const frames = await parseSseFrames(response);
      const errorFrames = frames.filter((frame) => frame.event === "error");

      expect(errorFrames).toHaveLength(1);
      expect(errorFrames[0]?.data).toMatchObject(
        expectedDetail ? { message: expectedMessage, detail: expectedDetail } : { message: expectedMessage },
      );
      expect(frames.some((frame) => frame.event === "done")).toBe(false);

      if (expectedMessage === "persist_failed") {
        expect(frames.map((frame) => frame.event)).toEqual(["delta", "error"]);
      } else {
        expect(frames).toHaveLength(1);
      }
    }

    expect(hoisted.currentSupabase?.insertCalls.length ?? 0).toBe(expectInsertCalls);
  });
});
