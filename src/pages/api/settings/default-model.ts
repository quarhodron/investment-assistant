import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return context.redirect("/auth/signin");
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/settings?error=${encodeURIComponent("Service unavailable")}`);
  }

  let modelId: string | null;
  try {
    const form = await context.request.formData();
    const raw = form.get("model_id");
    modelId = typeof raw === "string" ? raw : null;
  } catch {
    return context.redirect(`/settings?error=${encodeURIComponent("Invalid request")}`);
  }

  if (modelId === null || modelId === "") {
    const { error } = await supabase.from("user_settings").update({ default_model: null }).eq("user_id", user.id);

    if (error) {
      return context.redirect(`/settings?error=${encodeURIComponent("save_failed")}`);
    }
    return context.redirect("/settings?ok=1");
  }

  const { data: model, error: modelError } = await supabase
    .from("ai_models")
    .select("id")
    .eq("id", modelId)
    .eq("enabled", true)
    .maybeSingle();

  if (modelError || !model) {
    return context.redirect(`/settings?error=${encodeURIComponent("invalid_model")}`);
  }

  const { error: updateError } = await supabase
    .from("user_settings")
    .update({ default_model: modelId })
    .eq("user_id", user.id);

  if (updateError) {
    return context.redirect(`/settings?error=${encodeURIComponent("save_failed")}`);
  }

  return context.redirect("/settings?ok=1");
};
