import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AiModel } from "@/types";

interface KeyStatus {
  configured: boolean;
}

interface Props {
  status: { anthropic: KeyStatus; openai: KeyStatus };
  models: AiModel[];
  defaultModelId: string | null;
}

function ApiKeyCard({
  provider,
  label,
  configured,
}: {
  provider: "anthropic" | "openai";
  label: string;
  configured: boolean;
}) {
  const [replacing, setReplacing] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label} API Key</CardTitle>
      </CardHeader>
      <CardContent>
        {configured && !replacing ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-green-600">{label} key configured</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setReplacing(true);
              }}
            >
              Replace
            </Button>
            <form method="POST" action="/api/settings/api-keys">
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="provider" value={provider} />
              <Button type="submit" variant="destructive" size="sm">
                Remove
              </Button>
            </form>
          </div>
        ) : (
          <form method="POST" action="/api/settings/api-keys" className="flex items-end gap-3">
            <input type="hidden" name="provider" value={provider} />
            <div className="flex-1 space-y-1">
              <Label htmlFor={`key-${provider}`}>Paste your {label} API key</Label>
              <Input
                id={`key-${provider}`}
                name="api_key"
                type="password"
                placeholder={provider === "anthropic" ? "sk-ant-..." : "sk-..."}
                autoComplete="off"
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              {configured && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setReplacing(false);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </form>
        )}
      </CardContent>
    </Card>
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
    <div className="space-y-6">
      <ApiKeyCard provider="anthropic" label="Anthropic" configured={status.anthropic.configured} />
      <ApiKeyCard provider="openai" label="OpenAI" configured={status.openai.configured} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Model</CardTitle>
        </CardHeader>
        <CardContent>
          <form method="POST" action="/api/settings/default-model" className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="model_id">Select default model</Label>
              <select
                id="model_id"
                name="model_id"
                defaultValue={defaultModelId ?? ""}
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— No default —</option>
                {Object.entries(grouped).map(([prov, provModels]) => (
                  <optgroup key={prov} label={providerLabels[prov] ?? prov}>
                    {provModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
