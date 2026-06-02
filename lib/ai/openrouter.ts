import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const appUrl =
  process.env.OPENROUTER_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
const appName = process.env.OPENROUTER_APP_NAME ?? "VANDOR";

export function createOpenRouterClient(
  apiKey: string,
  meta?: { appUrl?: string; appName?: string }
) {
  const referer = meta?.appUrl?.trim() || appUrl;
  const title = meta?.appName?.trim() || appName;
  return createOpenRouter({
    apiKey,
    headers: {
      ...(referer ? { "HTTP-Referer": referer } : {}),
      "X-Title": title,
    },
    extraBody: {
      include_reasoning: true,
    },
  });
}

export const openrouter = createOpenRouterClient(
  process.env.OPENROUTER_API_KEY ?? ""
);

export function isOpenRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
