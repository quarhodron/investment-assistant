import type { StoredSources } from "@/types";

export function flattenSources(sources: StoredSources | null): { title: string | null; url: string }[] {
  if (!sources) return [];
  if (sources.provider === "anthropic") {
    return sources.items.map((item) => ({ title: item.title, url: item.url }));
  }
  return sources.items.map((item) => ({ title: item.title, url: item.url }));
}
