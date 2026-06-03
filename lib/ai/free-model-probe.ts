import "server-only";

import { generateText, type ModelMessage } from "ai";
import {
  getLanguageModel,
  type OpenRouterClientMeta,
} from "@/lib/ai/providers";
import { buildOpenRouterProviderOptions } from "@/lib/ai/openrouter-routing";

const PROBE_MAX_OUTPUT_TOKENS = 12;
const PROBE_TIMEOUT_MS = 18_000;

function lastUserTextFromMessages(messages: ModelMessage[] | undefined): string {
  if (!messages?.length) return "ping";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const content = m.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim().slice(0, 400);
    }
    if (Array.isArray(content)) {
      const text = content
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join(" ")
        .trim();
      if (text) return text.slice(0, 400);
    }
  }
  return "ping";
}

/**
 * Quick OpenRouter check that a :free model actually responds before full stream.
 */
export async function probeFreeOpenRouterModel(params: {
  modelId: string;
  apiKey: string;
  meta?: OpenRouterClientMeta;
  messages?: ModelMessage[];
}): Promise<void> {
  const prompt = lastUserTextFromMessages(params.messages);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const result = await generateText({
      model: getLanguageModel(params.modelId, params.apiKey, params.meta),
      prompt,
      maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS,
      maxRetries: 0,
      abortSignal: controller.signal,
      providerOptions: buildOpenRouterProviderOptions({
        primary: params.modelId,
        freeMode: true,
        isFreeTier: true,
        sequentialOnly: true,
      }),
    });

    const text = result.text?.trim() ?? "";
    if (!text) {
      throw new Error("Model mengembalikan respons kosong");
    }
  } finally {
    clearTimeout(timer);
  }
}
