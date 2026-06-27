import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const PATCH: APIRoute = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== new URL(context.request.url).origin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const user = context.locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(JSON.stringify({ error: "service_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (typeof body !== "object" || body === null || !("company_id" in body)) {
    return new Response(JSON.stringify({ error: "missing_company_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { company_id } = body as { company_id: string | null };

  if (company_id !== null && typeof company_id !== "string") {
    return new Response(JSON.stringify({ error: "invalid_company_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { id } = context.params as { id: string };

  // Verify ownership of the company if linking (not clearing)
  if (company_id !== null && company_id !== "") {
    const { data: companyData } = await supabase
      .from("watched_companies")
      .select("id")
      .eq("id", company_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!companyData) {
      return new Response(JSON.stringify({ error: "company_not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const { error: updateError } = await supabase
    .from("analyses")
    .update({ company_id: company_id ?? null })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: "analysis_not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, company_id: company_id ?? null }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
