import React, { useState } from "react";
import type { AiModel } from "@/types";

interface KeyStatus {
  configured: boolean;
}

interface Props {
  status: { anthropic: KeyStatus; openai: KeyStatus };
  models: AiModel[];
  defaultModelId: string | null;
}

const LABEL = "text-muted-foreground mb-1.5 block text-[0.6875rem] font-medium tracking-[0.16em] uppercase";
const INPUT =
  "border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:border-foreground focus:ring-ring/40 block w-full border px-3 py-2.5 text-sm transition-colors focus:ring-2 focus:outline-none";
const PRIMARY_BTN =
  "bg-foreground text-background inline-flex items-center gap-3 px-4 py-2.5 text-sm font-medium tracking-tight transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const GHOST_BTN =
  "border-foreground/30 hover:border-foreground text-foreground inline-flex items-center border-x px-4 py-2.5 text-sm font-medium tracking-tight transition-colors";
const DESTRUCTIVE_BTN =
  "text-destructive border-destructive/60 hover:bg-destructive hover:text-background inline-flex items-center border-x px-4 py-2.5 text-sm font-medium tracking-tight transition-colors";

function Section({
  number,
  title,
  description,
  children,
}: {
  number: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border/70 grid gap-8 border-t pt-10 lg:grid-cols-12 lg:gap-12">
      <header className="lg:col-span-4">
        <p className="num text-muted-foreground/80 text-[0.6875rem]">{number} ──</p>
        <h2 className="font-display mt-3 text-2xl tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{description}</p>
      </header>
      <div className="lg:col-span-8">{children}</div>
    </section>
  );
}

function ApiKeyRow({
  provider,
  label,
  placeholder,
  configured,
}: {
  provider: "anthropic" | "openai";
  label: string;
  placeholder: string;
  configured: boolean;
}) {
  const [replacing, setReplacing] = useState(false);

  return (
    <div className="border-border/70 flex flex-wrap items-end justify-between gap-4 border-b py-5 first:border-t">
      <div>
        <p className="text-foreground text-base font-medium">{label}</p>
        <p className="num text-muted-foreground mt-1 inline-flex items-center gap-2 text-[0.6875rem]">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${configured ? "bg-positive" : "bg-muted-foreground/40"}`}
            aria-hidden="true"
          />
          {configured ? "configured · encrypted at rest" : "not configured"}
        </p>
      </div>

      {configured && !replacing ? (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setReplacing(true);
            }}
            className={GHOST_BTN}
          >
            Replace
          </button>
          <form method="POST" action="/api/settings/api-keys">
            <input type="hidden" name="action" value="remove" />
            <input type="hidden" name="provider" value={provider} />
            <button type="submit" className={DESTRUCTIVE_BTN}>
              Remove
            </button>
          </form>
        </div>
      ) : (
        <form
          method="POST"
          action="/api/settings/api-keys"
          className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end"
        >
          <input type="hidden" name="provider" value={provider} />
          <div className="sm:w-72">
            <label htmlFor={`key-${provider}`} className={LABEL}>
              Paste {label} key
            </label>
            <input
              id={`key-${provider}`}
              name="api_key"
              type="password"
              placeholder={placeholder}
              autoComplete="off"
              required
              className={`${INPUT} font-mono`}
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className={PRIMARY_BTN}>
              <span className="bg-primary inline-block h-1.5 w-1.5" />
              Save
            </button>
            {configured && (
              <button
                type="button"
                onClick={() => {
                  setReplacing(false);
                }}
                className="text-muted-foreground hover:text-foreground px-3 py-2.5 text-sm transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function groupByProvider(models: AiModel[]): Partial<Record<string, AiModel[]>> {
  const groups: Partial<Record<string, AiModel[]>> = {};
  for (const model of models) {
    groups[model.provider] ??= [];
    groups[model.provider].push(model);
  }
  return groups;
}

export default function SettingsForm({ status, models, defaultModelId }: Props) {
  const grouped = groupByProvider(models);
  const providerLabels: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI" };

  return (
    <div className="space-y-12">
      <Section
        number="01"
        title="Model API keys"
        description="Bring your own keys. Each is encrypted at rest and never displayed once saved."
      >
        <ApiKeyRow provider="openai" label="OpenAI" placeholder="sk-..." configured={status.openai.configured} />
        <ApiKeyRow
          provider="anthropic"
          label="Anthropic"
          placeholder="sk-ant-..."
          configured={status.anthropic.configured}
        />
      </Section>

      <Section
        number="02"
        title="Default model"
        description="Pre-selected when you open the new-analysis form. You can always override per run."
      >
        <form
          method="POST"
          action="/api/settings/default-model"
          className="border-border/70 flex flex-col gap-4 border-t py-5 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label htmlFor="model_id" className={LABEL}>
              Default model
            </label>
            <select id="model_id" name="model_id" defaultValue={defaultModelId ?? ""} className={`${INPUT} font-mono`}>
              <option value="">— No default —</option>
              {Object.entries(grouped).map(([prov, provModels]) => (
                <optgroup key={prov} label={providerLabels[prov] ?? prov}>
                  {provModels?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button type="submit" className={PRIMARY_BTN}>
            <span className="bg-primary inline-block h-1.5 w-1.5" />
            Save
          </button>
        </form>
      </Section>
    </div>
  );
}
