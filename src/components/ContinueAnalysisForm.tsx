import React, { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Prompt, AiModel } from "@/types";

interface ParentAnalysis {
  id: string;
  title: string;
  input: string;
  extra_context: string | null;
  prompt_id: string | null;
  company_id: string | null;
}

interface Props {
  parentAnalysis: ParentAnalysis;
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

  if (message === "parent_not_found") return "The parent analysis could not be found. It may have been deleted.";
  if (message === "api_key_not_configured") return "No API key configured for this provider. Add one in Settings.";
  if (message === "api_key_corrupted")
    return "The stored API key appears corrupted. Remove it in Settings and add it again.";
  if (message === "invalid_model") return "The selected model is not available. Try a different model.";
  if (message === "persist_failed") return "Analysis completed but could not be saved. Try again.";
  if (message === "service_unavailable") return "Service unavailable. Check that Supabase is reachable.";

  if (message === "openai_api_error" || message === "anthropic_api_error") {
    const provider = message === "openai_api_error" ? "OpenAI" : "Anthropic";
    if (status === 401) return `${provider} rejected the API key. Check it is correct in Settings.`;
    if (status === 403) return `${provider} access denied. Your key may lack the required permissions.`;
    if (status === 429 && code === "insufficient_quota")
      return `${provider} quota exhausted. Check your account has credits.`;
    if (status === 429) return `${provider} rate limit reached. Wait a moment and try again.`;
    if (status && status >= 500) return `${provider} is having issues (${status}). Try again shortly.`;
    return `${provider} returned an error. Check your API key in Settings.`;
  }

  return message || "An unexpected error occurred.";
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
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="text-muted-foreground/60 hover:text-foreground ml-1.5 cursor-pointer focus:outline-none"
        aria-label="More info"
      >
        <Info size={13} />
      </button>
      {open && (
        <span className="border-border bg-card text-muted-foreground absolute top-5 left-0 z-10 w-64 border px-3 py-2 text-xs leading-relaxed shadow-md">
          {text}
        </span>
      )}
    </span>
  );
}

function groupByProvider(models: AiModel[]): Record<string, AiModel[]> {
  const groups: Record<string, AiModel[]> = {};
  for (const model of models) {
    const list = (groups[model.provider] ??= []);
    list.push(model);
  }
  return groups;
}

const PROVIDER_LABELS: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI" };

export default function ContinueAnalysisForm({ parentAnalysis, prompts, models, apiKeyStatus, defaultModelId }: Props) {
  const firstWithKey = models.find((m) => apiKeyStatus[m.provider as keyof typeof apiKeyStatus]);
  const firstModelId = firstWithKey?.id ?? models.at(0)?.id ?? "";
  const initialModelId = defaultModelId ?? firstModelId;

  const parentPromptInList = prompts.find((p) => p.id === parentAnalysis.prompt_id);
  const initialPromptId = parentPromptInList?.id ?? prompts.at(0)?.id ?? "";
  const initialTitle = "Continue: " + parentAnalysis.title.slice(0, 290);

  const [promptId, setPromptId] = useState(initialPromptId);
  const [modelId, setModelId] = useState(initialModelId);
  const [input, setInput] = useState(parentAnalysis.input);
  const [extraContext, setExtraContext] = useState("");
  const [title, setTitle] = useState(initialTitle);

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
      parent_analysis_id: parentAnalysis.id,
    };
    if (selectedPrompt.description) {
      payload.prompt_description = selectedPrompt.description;
    }
    if (extraContext.trim()) {
      payload.extra_context = extraContext;
    }
    if (parentAnalysis.company_id) {
      payload.company_id = parentAnalysis.company_id;
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

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
                setErrorFrame(data as unknown as ErrorFrame);
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
      <div className="border-border/70 bg-card flex flex-col items-start gap-3 border p-8">
        <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">Setup required</p>
        <p className="font-display text-2xl tracking-tight">No prompts yet.</p>
        <p className="text-muted-foreground text-sm">You need at least one prompt before running an analysis.</p>
        <a
          href="/prompts"
          className="bg-primary text-primary-foreground hover:bg-primary/80 mt-2 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium tracking-[0.08em] transition-colors"
        >
          Create your first prompt →
        </a>
      </div>
    );
  }

  const fieldLabel = "text-muted-foreground mb-1.5 flex items-center text-xs font-medium tracking-[0.16em] uppercase";
  const fieldControl =
    "border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:ring-ring/40 block w-full border px-3 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className="space-y-8">
      {/* Form — flat card, hairline border */}
      <div className="border-border/70 bg-card border p-6 sm:p-8">
        <div className="space-y-5">
          {/* Prompt selector */}
          <div>
            <label htmlFor="prompt_id" className={fieldLabel}>
              Prompt <span className="text-destructive ml-1 tracking-normal normal-case">*</span>
            </label>
            <select
              id="prompt_id"
              value={promptId}
              onChange={(e) => {
                setPromptId(e.target.value);
              }}
              disabled={frozen}
              className={fieldControl}
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Model selector */}
          <div>
            <label htmlFor="model_id" className={fieldLabel}>
              Model <span className="text-destructive ml-1 tracking-normal normal-case">*</span>
            </label>
            <select
              id="model_id"
              value={modelId}
              onChange={(e) => {
                setModelId(e.target.value);
              }}
              disabled={frozen}
              className={`${fieldControl} font-mono`}
            >
              {Object.entries(grouped).map(([prov, provModels]) => (
                <optgroup key={prov} label={PROVIDER_LABELS[prov] ?? prov}>
                  {provModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* No API key alert */}
          {!hasApiKey && selectedProvider && (
            <div className="flex items-start gap-3 border-l-2 border-amber-600/70 bg-[color-mix(in_oklch,oklch(0.62_0.14_70)_8%,transparent)] px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
              <span className="text-xs font-medium tracking-[0.14em] uppercase">Setup</span>
              <span>
                No API key configured for {PROVIDER_LABELS[selectedProvider] ?? selectedProvider}.{" "}
                <a href="/settings" className="text-foreground font-medium underline underline-offset-2">
                  Configure it in Settings →
                </a>
              </span>
            </div>
          )}

          {/* Topic */}
          <div>
            <label htmlFor="input" className={fieldLabel}>
              Topic <span className="text-destructive mx-1 tracking-normal normal-case">*</span>
              <FieldHint text="What you want the AI to analyze — a sector, macro theme, news event, or any free-text subject. This is sent directly to the model." />
            </label>
            <input
              type="text"
              id="input"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
              disabled={frozen}
              placeholder="e.g. renewable energy sector, S&P 500 index, Tesla"
              className={fieldControl}
            />
          </div>

          {/* Extra context */}
          <div>
            <label htmlFor="extra_context" className={fieldLabel}>
              Extra context{" "}
              <span className="text-muted-foreground/60 ml-1 tracking-normal normal-case">(optional)</span>
            </label>
            <textarea
              id="extra_context"
              value={extraContext}
              onChange={(e) => {
                setExtraContext(e.target.value);
              }}
              disabled={frozen}
              rows={2}
              placeholder="Any additional context for this continuation"
              className={fieldControl}
            />
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className={fieldLabel}>
              Title <span className="text-destructive mx-1 tracking-normal normal-case">*</span>
              <FieldHint text="The name for the saved record in your analyses history." />
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
              }}
              disabled={frozen}
              maxLength={300}
              placeholder="e.g. Continue: Renewable energy sector overview"
              className={fieldControl}
            />
          </div>

          {/* Run button */}
          <div className="border-border/60 flex items-center justify-between gap-4 border-t pt-5">
            <p className="text-muted-foreground text-xs">
              {status === "streaming" ? (
                <span className="text-foreground inline-flex items-center gap-2">
                  <span className="bg-primary inline-block h-1.5 w-1.5 animate-pulse" />
                  Streaming response…
                </span>
              ) : (
                <>Branching from parent analysis.</>
              )}
            </p>
            <button
              type="button"
              onClick={handleRun}
              disabled={frozen || !hasApiKey || !input.trim() || !promptId || !title.trim()}
              className="bg-primary text-primary-foreground hover:bg-primary/80 active:bg-primary/70 inline-flex cursor-pointer items-center gap-3 px-5 py-2.5 text-sm font-medium tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "streaming" ? "Running…" : "Run analysis"}
            </button>
          </div>
        </div>
      </div>

      {/* Output panel */}
      {(status === "streaming" || status === "saved" || status === "error") && (
        <div className="border-border/70 bg-card border p-6 sm:p-8">
          <div className="border-border/70 mb-5 flex items-baseline justify-between border-b pb-3">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase">Output</p>
            <p className="text-muted-foreground font-mono text-xs">
              {status === "streaming" && <span className="text-foreground">● live</span>}
              {status === "saved" && <span className="text-positive">● saved</span>}
              {status === "error" && <span className="text-destructive">● error</span>}
            </p>
          </div>

          {output && (
            <div className="text-foreground/90 [&_h1]:font-display [&_h2]:font-display [&_strong]:text-foreground mb-4 max-w-none text-[0.95rem] leading-[1.65] [&_a]:underline [&_a]:underline-offset-2 [&_em]:italic [&_h1]:mt-6 [&_h1]:mb-2.5 [&_h1]:text-xl [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown>{output}</ReactMarkdown>
            </div>
          )}

          {status === "streaming" && (
            <p className="text-muted-foreground inline-flex items-center gap-2 text-xs">
              <span className="bg-foreground inline-block h-1.5 w-1.5 animate-pulse" />
              Receiving response…
            </p>
          )}

          {status === "saved" && analysisId && (
            <div className="text-positive border-positive/40 flex items-baseline gap-3 border-l-2 bg-[color-mix(in_oklch,var(--positive)_8%,transparent)] px-3 py-2.5 text-sm">
              <span className="text-xs font-medium tracking-[0.14em] uppercase">Saved</span>
              <a href={`/analyses/${analysisId}`} className="text-foreground font-medium underline underline-offset-2">
                View analysis →
              </a>
            </div>
          )}

          {status === "error" && errorFrame && (
            <div className="text-destructive border-destructive/40 flex items-baseline gap-3 border-l-2 bg-[color-mix(in_oklch,var(--destructive)_8%,transparent)] px-3 py-2.5 text-sm">
              <span className="text-xs font-medium tracking-[0.14em] uppercase">Error</span>
              <span>{friendlyError(errorFrame)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
