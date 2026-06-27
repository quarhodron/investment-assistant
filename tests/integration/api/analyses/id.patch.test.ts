import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/pages/api/analyses/[id]";
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

interface PatchResponse {
  ok?: boolean;
  company_id?: string | null;
  error?: string;
}

const ANALYSIS_ID = "analysis-1";
const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const COMPANY_ID = "company-1";

describe("PATCH /api/analyses/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.createClientMock.mockImplementation(() => hoisted.currentSupabase);
  });

  function buildStub(
    opts: {
      companyBelongsToUser?: boolean;
      analysisFound?: boolean;
      companyId?: string | null;
    } = {},
  ): SupabaseStub {
    const { companyBelongsToUser = true, analysisFound = true, companyId = COMPANY_ID } = opts;
    return createSupabaseStub({
      watched_companies: (query) => {
        if (query.filters.id === COMPANY_ID && query.filters.user_id === USER_ID && companyBelongsToUser) {
          return { data: { id: COMPANY_ID }, error: null };
        }
        return { data: null, error: null };
      },
      analyses: () => {
        if (analysisFound) {
          return { data: { id: ANALYSIS_ID, company_id: companyId }, error: null };
        }
        return { data: null, error: { code: "PGRST116", message: "not found" } };
      },
    });
  }

  it("sets company_id for an owned company", async () => {
    hoisted.currentSupabase = buildStub();
    const res = await PATCH(
      buildApiContext({
        method: "PATCH",
        params: { id: ANALYSIS_ID },
        body: { company_id: COMPANY_ID },
        user: { id: USER_ID },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as PatchResponse;
    expect(json).toEqual({ ok: true, company_id: COMPANY_ID });
    expect(hoisted.currentSupabase.updateCalls).toHaveLength(1);
    expect(hoisted.currentSupabase.updateCalls[0]?.row).toMatchObject({ company_id: COMPANY_ID });
  });

  it("rejects a company_id not owned by the user — no update issued", async () => {
    hoisted.currentSupabase = buildStub({ companyBelongsToUser: false });
    const res = await PATCH(
      buildApiContext({
        method: "PATCH",
        params: { id: ANALYSIS_ID },
        body: { company_id: COMPANY_ID },
        user: { id: OTHER_USER_ID },
      }),
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as PatchResponse;
    expect(json.error).toBe("company_not_found");
    expect(hoisted.currentSupabase.updateCalls).toHaveLength(0);
  });

  it("clears company_id when null is passed", async () => {
    hoisted.currentSupabase = buildStub({ companyId: null });
    const res = await PATCH(
      buildApiContext({
        method: "PATCH",
        params: { id: ANALYSIS_ID },
        body: { company_id: null },
        user: { id: USER_ID },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as PatchResponse;
    expect(json).toEqual({ ok: true, company_id: null });
    // No ownership check needed for null; update should be called
    expect(hoisted.currentSupabase.updateCalls).toHaveLength(1);
    expect(hoisted.currentSupabase.updateCalls[0]?.row).toMatchObject({ company_id: null });
  });

  it("returns 404 when analysis is not owned by the user", async () => {
    hoisted.currentSupabase = buildStub({ analysisFound: false });
    const res = await PATCH(
      buildApiContext({
        method: "PATCH",
        params: { id: "foreign-analysis" },
        body: { company_id: null },
        user: { id: USER_ID },
      }),
    );

    expect(res.status).toBe(404);
    const json = (await res.json()) as PatchResponse;
    expect(json.error).toBe("analysis_not_found");
  });

  it("clears company_id when empty string is passed (treated as null)", async () => {
    hoisted.currentSupabase = buildStub({ companyId: null });
    const res = await PATCH(
      buildApiContext({
        method: "PATCH",
        params: { id: ANALYSIS_ID },
        body: { company_id: "" },
        user: { id: USER_ID },
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as PatchResponse;
    expect(json).toEqual({ ok: true, company_id: null });
    // Empty string skips ownership check, like null
    expect(hoisted.currentSupabase.updateCalls).toHaveLength(1);
    expect(hoisted.currentSupabase.updateCalls[0]?.row).toMatchObject({ company_id: null });
  });

  it("returns 401 when unauthenticated", async () => {
    hoisted.currentSupabase = buildStub();
    const res = await PATCH(
      buildApiContext({
        method: "PATCH",
        params: { id: ANALYSIS_ID },
        body: { company_id: COMPANY_ID },
        user: null,
      }),
    );

    expect(res.status).toBe(401);
  });
});
