import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

interface WatchlistFields {
  nameStr: string;
  tickerStr: string;
  exchangeStr: string;
  industryStr: string;
  noteStr: string;
}

interface ValidationOk {
  ok: true;
  name: string;
  ticker: string | null;
  exchange: string | null;
  industry: string | null;
  note: string | null;
}
interface ValidationError {
  ok: false;
  error: string;
}
type ValidationResult = ValidationOk | ValidationError;

function validateWatchlistFields(fields: WatchlistFields): ValidationResult {
  const { nameStr, tickerStr, exchangeStr, industryStr, noteStr } = fields;

  if (nameStr.trim().length < 1 || nameStr.trim().length > 200) {
    return { ok: false, error: "Company name must be 1–200 characters" };
  }

  const name = nameStr.trim();
  const ticker = tickerStr.trim().length > 0 ? tickerStr.trim() : null;
  const exchange = exchangeStr.trim().length > 0 ? exchangeStr.trim() : null;
  const industry = industryStr.trim().length > 0 ? industryStr.trim() : null;
  const note = noteStr.trim().length > 0 ? noteStr.trim() : null;

  if (ticker !== null && ticker.length > 20) {
    return { ok: false, error: "Ticker must be at most 20 characters" };
  }
  if (exchange !== null && exchange.length > 50) {
    return { ok: false, error: "Exchange must be at most 50 characters" };
  }
  if (industry !== null && industry.length > 200) {
    return { ok: false, error: "Industry must be at most 200 characters" };
  }
  if (note !== null && note.length > 2000) {
    return { ok: false, error: "Note must be at most 2,000 characters" };
  }
  if ((ticker === null) !== (exchange === null)) {
    return { ok: false, error: "Ticker and exchange must be provided together" };
  }

  return { ok: true, name, ticker, exchange, industry, note };
}

export const POST: APIRoute = async (context) => {
  const origin = context.request.headers.get("Origin");
  const isJsonRequest =
    (context.request.headers.get("Content-Type")?.includes("application/json") ?? false) ||
    (context.request.headers.get("Accept")?.includes("application/json") ?? false);

  if (origin && origin !== new URL(context.request.url).origin) {
    if (isJsonRequest) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    return context.redirect(`/watchlist?error=${encodeURIComponent("forbidden")}`);
  }

  const user = context.locals.user;
  if (!user) {
    if (isJsonRequest) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    if (isJsonRequest) {
      return new Response(JSON.stringify({ error: "service_unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    return context.redirect(`/watchlist?error=${encodeURIComponent("Service unavailable")}`);
  }

  if (isJsonRequest) {
    let body: unknown;
    try {
      body = await context.request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
    const fields: WatchlistFields = {
      nameStr: typeof b.name === "string" ? b.name : "",
      tickerStr: typeof b.ticker === "string" ? b.ticker : "",
      exchangeStr: typeof b.exchange === "string" ? b.exchange : "",
      industryStr: typeof b.industry === "string" ? b.industry : "",
      noteStr: typeof b.note === "string" ? b.note : "",
    };

    const validation = validateWatchlistFields(fields);
    if (!validation.ok) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { name, ticker, exchange, industry, note } = validation;

    const { data, error } = await supabase
      .from("watched_companies")
      .insert({ user_id: user.id, name, ticker, exchange, industry, note })
      .select("id, name, ticker, exchange, industry, note")
      .single();

    if (error) {
      if (error.code === "23505") {
        return new Response(
          JSON.stringify({
            error: "duplicate",
            message: "You already track this company — use Link to watched company instead.",
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "Failed to create company" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // FormData branch — existing redirect behavior
  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(`/watchlist?error=${encodeURIComponent("Invalid request")}`);
  }

  const nameStr = typeof form.get("name") === "string" ? (form.get("name") as string) : "";
  const tickerStr = typeof form.get("ticker") === "string" ? (form.get("ticker") as string) : "";
  const exchangeStr = typeof form.get("exchange") === "string" ? (form.get("exchange") as string) : "";
  const industryStr = typeof form.get("industry") === "string" ? (form.get("industry") as string) : "";
  const noteStr = typeof form.get("note") === "string" ? (form.get("note") as string) : "";

  const formParams =
    `&_name=${encodeURIComponent(nameStr)}` +
    `&_ticker=${encodeURIComponent(tickerStr)}` +
    `&_exchange=${encodeURIComponent(exchangeStr)}` +
    `&_industry=${encodeURIComponent(industryStr)}` +
    `&_note=${encodeURIComponent(noteStr)}`;

  const validation = validateWatchlistFields({ nameStr, tickerStr, exchangeStr, industryStr, noteStr });
  if (!validation.ok) {
    return context.redirect(`/watchlist?error=${encodeURIComponent(validation.error)}${formParams}`);
  }

  const { name, ticker, exchange, industry, note } = validation;

  const { error } = await supabase.from("watched_companies").insert({
    user_id: user.id,
    name,
    ticker,
    exchange,
    industry,
    note,
  });

  if (error) {
    if (error.code === "23505") {
      return context.redirect(
        `/watchlist?error=${encodeURIComponent("You already track this ticker on that exchange")}${formParams}`,
      );
    }
    return context.redirect(`/watchlist?error=${encodeURIComponent("Failed to create company")}${formParams}`);
  }

  return context.redirect("/watchlist?ok=1");
};
