import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== new URL(context.request.url).origin) {
    return context.redirect(`/watchlist?error=${encodeURIComponent("forbidden")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/watchlist?error=${encodeURIComponent("Service unavailable")}`);
  }

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

  if (nameStr.trim().length < 1 || nameStr.trim().length > 200) {
    return context.redirect(
      `/watchlist?error=${encodeURIComponent("Company name must be 1–200 characters")}${formParams}`,
    );
  }

  const name = nameStr.trim();
  const ticker = tickerStr.trim().length > 0 ? tickerStr.trim() : null;
  const exchange = exchangeStr.trim().length > 0 ? exchangeStr.trim() : null;
  const industry = industryStr.trim().length > 0 ? industryStr.trim() : null;
  const note = noteStr.trim().length > 0 ? noteStr.trim() : null;

  if (ticker !== null && ticker.length > 20) {
    return context.redirect(
      `/watchlist?error=${encodeURIComponent("Ticker must be at most 20 characters")}${formParams}`,
    );
  }
  if (exchange !== null && exchange.length > 50) {
    return context.redirect(
      `/watchlist?error=${encodeURIComponent("Exchange must be at most 50 characters")}${formParams}`,
    );
  }
  if (industry !== null && industry.length > 200) {
    return context.redirect(
      `/watchlist?error=${encodeURIComponent("Industry must be at most 200 characters")}${formParams}`,
    );
  }
  if (note !== null && note.length > 2000) {
    return context.redirect(
      `/watchlist?error=${encodeURIComponent("Note must be at most 2,000 characters")}${formParams}`,
    );
  }

  if ((ticker === null) !== (exchange === null)) {
    return context.redirect(
      `/watchlist?error=${encodeURIComponent("Ticker and exchange must be provided together")}${formParams}`,
    );
  }

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
