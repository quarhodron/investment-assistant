import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/pages/api/watchlist/index";
import { buildApiContext } from "../../_harness/api-context";
import { createSupabaseStub, type SupabaseStub } from "../../_harness/supabase-stub";

interface MockState {
  currentSupabase: SupabaseStub | null;
  createClientMock: ReturnType<typeof vi.fn>;
}

const hoisted: MockState = vi.hoisted(() => ({
  currentSupabase: null,
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: hoisted.createClientMock,
}));

interface WatchlistResponse {
  id?: string;
  name?: string;
  ticker?: string | null;
  exchange?: string | null;
  industry?: string | null;
  note?: string | null;
  error?: string;
  message?: string;
}

const NEW_COMPANY = {
  id: "company-new",
  name: "Test Co",
  ticker: "TST",
  exchange: "NYSE",
  industry: "Tech",
  note: null,
};

function buildJsonContext(body: unknown, user?: { id: string } | null) {
  return buildApiContext({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    ...(user !== undefined ? { user } : {}),
  });
}

describe("POST /api/watchlist (JSON mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createClientMock.mockImplementation(() => hoisted.currentSupabase);
  });

  it("returns {id, ...} on success", async () => {
    hoisted.currentSupabase = createSupabaseStub({
      watched_companies: () => ({ data: NEW_COMPANY, error: null }),
    });

    const res = await POST(buildJsonContext({ name: "Test Co", ticker: "TST", exchange: "NYSE", industry: "Tech" }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as WatchlistResponse;
    expect(json).toMatchObject({ id: "company-new", name: "Test Co" });
  });

  it("returns 400 on invalid name (empty)", async () => {
    hoisted.currentSupabase = createSupabaseStub({
      watched_companies: () => ({ data: null, error: null }),
    });

    const res = await POST(buildJsonContext({ name: "" }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as WatchlistResponse;
    expect(json.error).toContain("Company name");
  });

  it("returns 400 when ticker provided without exchange", async () => {
    hoisted.currentSupabase = createSupabaseStub({
      watched_companies: () => ({ data: null, error: null }),
    });

    const res = await POST(buildJsonContext({ name: "Test Co", ticker: "TST" }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as WatchlistResponse;
    expect(json.error).toContain("together");
  });

  it("returns 409 on duplicate (23505)", async () => {
    hoisted.currentSupabase = createSupabaseStub({
      watched_companies: () => ({ data: null, error: { code: "23505", message: "duplicate" } }),
    });

    const res = await POST(buildJsonContext({ name: "Test Co", ticker: "TST", exchange: "NYSE" }));

    expect(res.status).toBe(409);
    const json = (await res.json()) as WatchlistResponse;
    expect(json.error).toBe("duplicate");
    expect(json.message).toContain("Link to watched company");
  });
});
