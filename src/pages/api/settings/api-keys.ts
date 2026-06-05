import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { encryptApiKey } from "@/lib/services/api-key-crypto";
import { validateApiKeyInput } from "@/lib/validation";
import type { Json } from "@/db/database.types";

export const POST: APIRoute = async (context) => {
  const origin = context.request.headers.get("Origin");
  if (origin && origin !== new URL(context.request.url).origin) {
    return context.redirect(`/settings?error=${encodeURIComponent("forbidden")}`);
  }

  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/settings?error=${encodeURIComponent("Service unavailable")}`);
  }

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return context.redirect(`/settings?error=${encodeURIComponent("Invalid request")}`);
  }

  const action = form.get("action");

  if (action === "remove") {
    const provider = form.get("provider");
    if (provider !== "anthropic" && provider !== "openai") {
      return context.redirect(`/settings?error=${encodeURIComponent("invalid_provider")}`);
    }

    const { data: current, error: fetchError } = await supabase
      .from("user_settings")
      .select("api_keys")
      .eq("user_id", user.id)
      .single();

    if (fetchError) {
      return context.redirect(`/settings?error=${encodeURIComponent("remove_failed")}`);
    }

    const existingKeys = current.api_keys as Record<string, unknown>;
    const updatedKeys = Object.fromEntries(Object.entries(existingKeys).filter(([k]) => k !== provider));

    const { error: updateError } = await supabase
      .from("user_settings")
      .update({ api_keys: updatedKeys as Json })
      .eq("user_id", user.id);

    if (updateError) {
      return context.redirect(`/settings?error=${encodeURIComponent("remove_failed")}`);
    }

    return context.redirect("/settings?ok=1");
  }

  // Default: save a new key
  const provider = form.get("provider");
  const apiKey = form.get("api_key");

  const validation = validateApiKeyInput(provider, apiKey);
  if (!validation.ok) {
    return context.redirect(`/settings?error=${encodeURIComponent(validation.error)}`);
  }

  let blob: Awaited<ReturnType<typeof encryptApiKey>>;
  try {
    blob = await encryptApiKey(validation.value.key, user.id);
  } catch (err) {
    const code = err instanceof Error ? err.message : "encrypt_failed";
    return context.redirect(`/settings?error=${encodeURIComponent(code)}`);
  }

  const { data: current, error: fetchError } = await supabase
    .from("user_settings")
    .select("api_keys")
    .eq("user_id", user.id)
    .single();

  if (fetchError) {
    return context.redirect(`/settings?error=${encodeURIComponent("save_failed")}`);
  }

  const existingKeys = current.api_keys as Record<string, unknown>;
  const updatedKeys = { ...existingKeys, [validation.value.provider]: blob };

  const { error: updateError } = await supabase
    .from("user_settings")
    .update({ api_keys: updatedKeys as unknown as Json })
    .eq("user_id", user.id);

  if (updateError) {
    return context.redirect(`/settings?error=${encodeURIComponent("save_failed")}`);
  }

  return context.redirect("/settings?ok=1");
};
