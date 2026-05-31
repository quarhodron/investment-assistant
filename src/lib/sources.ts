import type { StoredSources } from "@/types";

export function flattenSources(sources: StoredSources | null): { title: string | null; url: string }[] {
  if (!sources) return [];
  return sources.items.map((item) => ({ title: item.title ?? null, url: item.url }));
}
