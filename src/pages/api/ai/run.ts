import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { decryptApiKey } from "@/lib/services/api-key-crypto";
import type { EncryptedBlob } from "@/lib/services/api-key-crypto";
import { runAiAnalysis } from "@/lib/services/ai";
import { validateRunInput } from "@/lib/validation";
import { toSafeAiError } from "@/lib/services/ai/errors";
import type { AnalysisInsert } from "@/types";
import type { Json } from "@/db/database.types";

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) {
    return new Response(null, { status: 401 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return new Response(sseFrame("error", { message: "service_unavailable" }), {
      status: 503,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return new Response(sseFrame("error", { message: "invalid_body" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const validation = validateRunInput(body);
  if (!validation.ok) {
    return new Response(sseFrame("error", { message: "invalid_input", detail: validation.error }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const input = validation.value;

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (frame: string) => {
        controller.enqueue(new TextEncoder().encode(frame));
      };

      try {
        const settingsResult = await supabase.from("user_settings").select("api_keys").eq("user_id", user.id).single();

        if (!settingsResult.data) {
          enqueue(sseFrame("error", { message: "settings_unavailable" }));
          controller.close();
          return;
        }

        const apiKeys = settingsResult.data.api_keys as Record<string, unknown>;
        const blobRaw = apiKeys[input.provider];

        if (!blobRaw) {
          enqueue(sseFrame("error", { message: "api_key_not_configured", provider: input.provider }));
          controller.close();
          return;
        }

        const modelResult = await supabase
          .from("ai_models")
          .select("id")
          .eq("id", input.model_id)
          .eq("provider", input.provider)
          .eq("enabled", true)
          .maybeSingle();

        if (!modelResult.data) {
          enqueue(sseFrame("error", { message: "invalid_model" }));
          controller.close();
          return;
        }

        let apiKey: string;
        try {
          apiKey = await decryptApiKey(blobRaw as EncryptedBlob, user.id);
        } catch (err) {
          const e = err instanceof Error ? err.message : "";
          if (e === "decrypt_failed") {
            enqueue(sseFrame("error", { message: "api_key_corrupted" }));
          } else {
            enqueue(sseFrame("error", { message: "decryption_unavailable" }));
          }
          controller.close();
          return;
        }

        const generator = runAiAnalysis({
          provider: input.provider,
          model: input.model_id,
          prompt: input.prompt_body,
          context: input.extra_context,
          apiKey,
        });

        for await (const event of generator) {
          if (event.kind === "text") {
            enqueue(sseFrame("delta", event.delta));
            continue;
          }

          // kind === "done"
          const row: AnalysisInsert = {
            user_id: user.id,
            analysis_type: input.analysis_type,
            title: input.title,
            input: input.input,
            output: event.output,
            sources: event.sources as unknown as Json,
            provider: input.provider,
            model: event.model,
            prompt_body_snapshot: input.prompt_body,
            prompt_name_snapshot: input.prompt_name,
            prompt_description_snapshot: input.prompt_description ?? null,
            prompt_id: input.prompt_id ?? null,
            extra_context: input.extra_context ?? null,
            subject: input.subject ?? null,
            parent_analysis_id: input.parent_analysis_id ?? null,
            company_id: input.company_id ?? null,
            input_tokens: event.usage.input_tokens,
            output_tokens: event.usage.output_tokens,
            cost_usd: null,
          };

          const insertResult = await supabase.from("analyses").insert(row).select("id").single();

          if (!insertResult.data) {
            enqueue(sseFrame("error", { message: "persist_failed" }));
            controller.close();
            return;
          }

          enqueue(
            sseFrame("done", {
              analysis_id: insertResult.data.id,
              sources: event.sources,
              usage: event.usage,
              model: event.model,
              provider: event.provider,
            }),
          );
        }
      } catch (err) {
        const safe = toSafeAiError(err);
        console.error("ai_run_failed", safe);
        enqueue(sseFrame("error", safe));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};
