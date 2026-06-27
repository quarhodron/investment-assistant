import type { APIRoute } from "astro";

type ApiRouteContext = Parameters<APIRoute>[0];

export function buildApiContext(opts: {
  body?: unknown;
  user?: { id: string } | null;
  origin?: string;
  headers?: Record<string, string>;
  params?: Record<string, string>;
  method?: string;
}): ApiRouteContext {
  const headers = new Headers(opts.headers);
  const url = opts.origin ?? "https://app.local";

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.origin && !headers.has("Origin")) {
    headers.set("Origin", opts.origin);
  }

  const request = new Request(`${url}/api/ai/run`, {
    method: opts.method ?? "POST",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  const cookies = {
    get() {
      return undefined;
    },
    set() {
      return undefined;
    },
    delete() {
      return undefined;
    },
  };

  return {
    request,
    locals: { user: "user" in opts ? opts.user : { id: "user-1" } },
    cookies,
    params: opts.params ?? {},
  } as unknown as ApiRouteContext;
}
