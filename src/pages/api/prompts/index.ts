import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== new URL(context.request.url).origin) {
    return context.redirect(`/prompts?error=${encodeURIComponent("forbidden")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/prompts?error=${encodeURIComponent("Service unavailable")}`);
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(`/prompts?error=${encodeURIComponent("Invalid request")}`);
  }

  const name = form.get("name");
  const body = form.get("body");
  const description = form.get("description");

  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 200) {
    return context.redirect(`/prompts?error=${encodeURIComponent("Prompt name must be 1–200 characters")}`);
  }
  if (typeof body !== "string" || body.trim().length < 1 || body.trim().length > 50000) {
    return context.redirect(`/prompts?error=${encodeURIComponent("Prompt body must be 1–50,000 characters")}`);
  }
  if (typeof description === "string" && description.trim().length > 500) {
    return context.redirect(`/prompts?error=${encodeURIComponent("Description must be at most 500 characters")}`);
  }

  const descValue =
    typeof description === "string" && description.trim().length > 0 ? description.trim() : null;

  const { error } = await supabase.from("prompts").insert({
    user_id: user.id,
    name: name.trim(),
    body: body.trim(),
    description: descValue,
  });

  if (error) {
    return context.redirect(`/prompts?error=${encodeURIComponent("Failed to create prompt")}`);
  }

  return context.redirect("/prompts?ok=1");
};
