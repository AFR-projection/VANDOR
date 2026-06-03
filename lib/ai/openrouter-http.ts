import "server-only";

import type { OpenRouterUserContext } from "@/lib/ai/integration-models";

type OpenRouterHttpOptions = {
  ctx: OpenRouterUserContext;
  path: string;
  body: unknown;
};

export async function openRouterFetch<T = unknown>({
  ctx,
  path,
  body,
}: OpenRouterHttpOptions): Promise<
  { ok: true; data: T } | { ok: false; status: number; error: string }
> {
  if (!ctx.apiKey) {
    return { ok: false, status: 503, error: "OpenRouter API key not configured." };
  }

  let resp: Response;
  try {
    resp = await fetch(`https://openrouter.ai/api/v1${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ctx.apiKey}`,
        ...(ctx.meta.appUrl ? { "HTTP-Referer": ctx.meta.appUrl } : {}),
        "X-Title": ctx.meta.appName,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const text = await resp.text().catch(() => "");
  let data: T | { error?: { message?: string } } = {};
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    data = {} as T;
  }

  if (!resp.ok) {
    const message =
      (data as { error?: { message?: string } }).error?.message ??
      text.slice(0, 400) ??
      `HTTP ${resp.status}`;
    return { ok: false, status: resp.status, error: message };
  }

  return { ok: true, data: data as T };
}
