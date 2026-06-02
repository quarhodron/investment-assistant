import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Prompt, AiModel } from "@/types";

interface Props {
  prompts: Pick<Prompt, "id" | "name" | "description" | "body">[];
  models: AiModel[];
  apiKeyStatus: { anthropic: boolean; openai: boolean };
  defaultModelId: string | null;
}

type Status = "idle" | "streaming" | "saved" | "error";

interface ErrorFrame {
  message: string;
  status?: number | null;
  code?: string | null;
}

function friendlyError(e: ErrorFrame): string {
  const { message, status, code } = e;

  if (message === "api_key_not_configured") return "No API key configured for this provider. Add one in Settings.";
  if (message === "api_key_corrupted") return "The stored API key appears corrupted. Remove it in Settings and add it again.";
  if (message === "invalid_model") return "The selected model is not available. Try a different model.";
  if (message === "persist_failed") return "Analysis completed but could not be saved. Try again.";
  if (message === "service_unavailable") return "Service unavailable. Check that Supabase is reachable.";

  if (message === "openai_api_error" || message === "anthropic_api_error") {
    const provider = message === "openai_api_error" ? "OpenAI" : "Anthropic";
    if (status === 401) return `${provider} rejected the API key. Check it is correct in Settings.`;
    if (status === 403) return `${provider} access denied. Your key may lack the required permissions.`;
    if (status === 429 && code === "insufficient_quota") return `${provider} quota exhausted. Check your account has credits.`;
    if (status === 429) return `${provider} rate limit reached. Wait a moment and try again.`;
    if (status && status >= 500) return `${provider} is having issues (${status}). Try again shortly.`;
    return `${provider} returned an error. Check your API key in Settings.`;
  }

  return message ?? "An unexpected error occurred.";
}

function FieldHint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-1 text-white/30 hover:text-white/60 focus:outline-none"
        aria-label="More info"
      >
        <Info size={13} />
      </button>
      {open && (
        <span className="absolute left-5 top-0 z-10 w-64 rounded-md border border-white/15 bg-slate-800 px-3 py-2 text-xs leading-relaxed text-white/70 shadow-lg">
          {text}
        </span>
      )}
    </span>
  );
}

function groupByProvider(models: AiModel[]): Partial<Record<string, AiModel[]>> {
  const groups: Partial<Record<string, AiModel[]>> = {};
  for (const model of models) {
    groups[model.provider] ??= [];
    groups[model.provider]!.push(model);
  }
  return groups;
}

const PROVIDER_LABELS: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI" };

export default function NewAnalysisForm({ prompts, models, apiKeyStatus, defaultModelId }: Props) {
  const firstWithKey = models.find((m) => apiKeyStatus[m.provider as keyof typeof apiKeyStatus]);
  const firstModelId = firstWithKey?.id ?? models[0]?.id ?? "";
  const initialModelId = defaultModelId ?? firstModelId;

  const [promptId, setPromptId] = useState(prompts[0]?.id ?? "");
  const [modelId, setModelId] = useState(initialModelId);
  const [input, setInput] = useState("");
  const [extraContext, setExtraContext] = useState("");
  const [title, setTitle] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [output, setOutput] = useState("");
  const [errorFrame, setErrorFrame] = useState<ErrorFrame | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const selectedModel = models.find((m) => m.id === modelId);
  const selectedProvider = selectedModel?.provider ?? "";
  const hasApiKey = selectedProvider ? apiKeyStatus[selectedProvider as keyof typeof apiKeyStatus] : false;


  async function handleRun() {
    const selectedPrompt = prompts.find((p) => p.id === promptId);
    if (!selectedPrompt || !selectedModel) return;

    const ac = new AbortController();
    abortRef.current = ac;

    setStatus("streaming");
    setOutput("");
    setErrorFrame(null);
    setAnalysisId(null);

    const payload: Record<string, string> = {
      provider: selectedModel.provider,
      model_id: selectedModel.id,
      prompt_id: selectedPrompt.id,
      prompt_body: selectedPrompt.body,
      prompt_name: selectedPrompt.name,
      input,
      subject: input,
      title,
    };
    if (selectedPrompt.description) {
      payload.prompt_description = selectedPrompt.description;
    }
    if (extraContext.trim()) {
      payload.extra_context = extraContext;
    }

    try {
      const response = await fetch("/api/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });

      if (!response.body) {
        setErrorFrame({ message: "No response stream received." });
        setStatus("error");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          if (!frame.trim()) continue;

          const lines = frame.split("\n");
          let eventType = "";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice("event: ".length).trim();
            } else if (line.startsWith("data: ")) {
              dataLine = line.slice("data: ".length).trim();
            }
          }

          if (!eventType || !dataLine) continue;

          try {
            if (eventType === "delta") {
              setOutput((prev) => prev + (JSON.parse(dataLine) as string));
            } else {
              const data = JSON.parse(dataLine) as Record<string, unknown>;
              if (eventType === "done") {
                setAnalysisId(data.analysis_id as string);
                setStatus("saved");
              } else if (eventType === "error") {
                setErrorFrame(data as ErrorFrame);
                setStatus("error");
              }
            }
          } catch {
            // malformed frame — skip
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // navigation abort — silence
        return;
      }
      setErrorFrame({ message: err instanceof Error ? err.message : "unexpected_error" });
      setStatus("error");
    }
  }

  const frozen = status === "streaming" || status === "saved";
  const grouped = groupByProvider(models);

  if (prompts.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center">
        <p className="mb-2 text-base font-medium text-white/80">No prompts yet</p>
        <p className="mb-4 text-sm text-white/60">You need at least one prompt before running an analysis.</p>
        <a
          href="/prompts"
          className="inline-block rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500"
        >
          Create your first prompt
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Form */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-6">
        <div className="space-y-4">
          {/* Prompt selector */}
          <div>
            <label htmlFor="prompt_id" className="mb-1 block text-sm font-medium text-white/70">
              Prompt <span className="text-red-400">*</span>
            </label>
            <select
              id="prompt_id"
              value={promptId}
              onChange={(e) => setPromptId(e.target.value)}
              disabled={frozen}
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none disabled:opacity-50"
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-800">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Model selector */}
          <div>
            <label htmlFor="model_id" className="mb-1 block text-sm font-medium text-white/70">
              Model <span className="text-red-400">*</span>
            </label>
            <select
              id="model_id"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={frozen}
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-purple-400 focus:outline-none disabled:opacity-50"
            >
              {Object.entries(grouped).map(([prov, provModels]) => (
                <optgroup key={prov} label={PROVIDER_LABELS[prov] ?? prov}>
                  {provModels!.map((m) => (
                    <option key={m.id} value={m.id} className="bg-slate-800">
                      {m.display_name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* No API key alert */}
          {!hasApiKey && selectedProvider && (
            <div className="rounded-md border border-yellow-400/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              No API key configured for {PROVIDER_LABELS[selectedProvider] ?? selectedProvider}.{" "}
              <a href="/settings" className="underline hover:text-yellow-100">
                Configure it in Settings.
              </a>
            </div>
          )}

          {/* Topic */}
          <div>
            <label htmlFor="input" className="mb-1 flex items-center text-sm font-medium text-white/70">
              Topic <span className="ml-0.5 text-red-400">*</span>
              <FieldHint text="What you want the AI to analyze — a sector, macro theme, news event, or any free-text subject. This is sent directly to the model." />
            </label>
            <input
              type="text"
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={frozen}
              placeholder="e.g. renewable energy sector, S&P 500 index, Tesla"
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Extra context */}
          <div>
            <label htmlFor="extra_context" className="mb-1 block text-sm font-medium text-white/70">
              Extra context <span className="text-white/40">(optional)</span>
            </label>
            <textarea
              id="extra_context"
              value={extraContext}
              onChange={(e) => setExtraContext(e.target.value)}
              disabled={frozen}
              rows={2}
              placeholder="Any additional context for the analysis"
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="mb-1 flex items-center text-sm font-medium text-white/70">
              Title <span className="ml-0.5 text-red-400">*</span>
              <FieldHint text="The name for the saved record in your analyses history." />
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={frozen}
              maxLength={300}
              placeholder="e.g. Renewable energy sector overview"
              className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-purple-400 focus:outline-none disabled:opacity-50"
            />
          </div>

          {/* Run button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={frozen || !hasApiKey || !input.trim() || !promptId || !title.trim()}
            className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "streaming" ? "Running…" : "Run analysis"}
          </button>
        </div>
      </div>

      {/* Output panel */}
      {(status === "streaming" || status === "saved" || status === "error") && (
        <div className="rounded-lg border border-white/10 bg-white/5 p-6">
          {output && (
            <div className="mb-4 text-sm leading-relaxed text-white/85 [&_h1]:mb-2 [&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-white [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-white [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_h3]:text-white/90 [&_li]:ml-4 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:mb-2 [&_strong]:font-semibold [&_strong]:text-white [&_ul]:my-2 [&_ul]:list-disc">
              <ReactMarkdown>{output}</ReactMarkdown>
            </div>
          )}

          {status === "streaming" && (
            <p className="text-sm text-purple-300 animate-pulse">Receiving response…</p>
          )}

          {status === "saved" && analysisId && (
            <div className="rounded-md border border-green-400/30 bg-green-500/10 p-3 text-sm text-green-200">
              Saved —{" "}
              <a href={`/analyses/${analysisId}`} className="underline hover:text-green-100">
                view analysis
              </a>
            </div>
          )}

          {status === "error" && errorFrame && (
            <div className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">
              {friendlyError(errorFrame)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
