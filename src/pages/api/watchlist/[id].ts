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

  const id = context.params.id;
  if (!id) {
    return context.redirect("/watchlist");
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

  const action = form.get("action");

  if (action === "delete") {
    const { error } = await supabase
      .from("watched_companies")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .single();

    if (error) {
      return context.redirect(`/watchlist?error=${encodeURIComponent("Company not found")}`);
    }

    return context.redirect("/watchlist?ok=deleted");
  }

  // Default: update
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

  const editBase = `/watchlist/${id}/edit`;

  if (nameStr.trim().length < 1 || nameStr.trim().length > 200) {
    return context.redirect(
      `${editBase}?error=${encodeURIComponent("Company name must be 1–200 characters")}${formParams}`,
    );
  }

  const name = nameStr.trim();
  const ticker = tickerStr.trim().length > 0 ? tickerStr.trim() : null;
  const exchange = exchangeStr.trim().length > 0 ? exchangeStr.trim() : null;
  const industry = industryStr.trim().length > 0 ? industryStr.trim() : null;
  const note = noteStr.trim().length > 0 ? noteStr.trim() : null;

  if (ticker !== null && ticker.length > 20) {
    return context.redirect(
      `${editBase}?error=${encodeURIComponent("Ticker must be at most 20 characters")}${formParams}`,
    );
  }
  if (exchange !== null && exchange.length > 50) {
    return context.redirect(
      `${editBase}?error=${encodeURIComponent("Exchange must be at most 50 characters")}${formParams}`,
    );
  }
  if (industry !== null && industry.length > 200) {
    return context.redirect(
      `${editBase}?error=${encodeURIComponent("Industry must be at most 200 characters")}${formParams}`,
    );
  }
  if (note !== null && note.length > 2000) {
    return context.redirect(
      `${editBase}?error=${encodeURIComponent("Note must be at most 2,000 characters")}${formParams}`,
    );
  }

  if ((ticker === null) !== (exchange === null)) {
    return context.redirect(
      `${editBase}?error=${encodeURIComponent("Ticker and exchange must be provided together")}${formParams}`,
    );
  }

  const { error } = await supabase
    .from("watched_companies")
    .update({ name, ticker, exchange, industry, note })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return context.redirect(
        `${editBase}?error=${encodeURIComponent("You already track this ticker on that exchange")}${formParams}`,
      );
    }
    if (error.code === "23514") {
      return context.redirect(
        `${editBase}?error=${encodeURIComponent("Ticker and exchange must be provided together")}${formParams}`,
      );
    }
    return context.redirect(`${editBase}?error=${encodeURIComponent("Failed to update company")}${formParams}`);
  }

  return context.redirect(`${editBase}?ok=1`);
};
