import "server-only";

import { RELIABLE_PAID_FALLBACKS } from "@/lib/ai/chat-modes";
import {
  buildGratisRotationChain,
  freeModelsForOpenRouterRouting,
  mergeFreeAttemptChain,
  OPENROUTER_FREE_MODEL_POOL,
} from "@/lib/ai/free-models";
import { sanitizeFreeModelSlots } from "@/lib/ai/model-slots";

export type OpenRouterRoutingInput = {
  primary: string;
  /** Extra fallbacks after primary (settings free model, etc.) */
  extraFallbacks?: string[];
  /** When true, only :free / openrouter/free models are appended */
  freeMode?: boolean;
  /** VANDOR rotates models itself — do not send OpenRouter `models[]` fallbacks */
  sequentialOnly?: boolean;
};

/**
 * OpenRouter limits the `models` fallback array to 3 items or fewer.
 * The primary model is sent separately via `model`, so this array holds
 * only the fallbacks (max 3).
 */
export const OPENROUTER_MAX_FALLBACK_MODELS = 3;

function isFreeModelId(id: string): boolean {
  const v = id.toLowerCase();
  return v.includes(":free") || v === "openrouter/free";
}

/** OpenRouter-native fallback list (see openrouter.ai/docs — `models` fallback). */
export function buildModelFallbackList(input: OpenRouterRoutingInput): string[] {
  const primary = input.primary.trim();
  const chain: string[] = [];
  const add = (id?: string) => {
    const v = id?.trim();
    if (!v || v === primary || chain.includes(v)) return;
    if (chain.length >= OPENROUTER_MAX_FALLBACK_MODELS) return;
    if (input.freeMode && !isFreeModelId(v)) return;
    chain.push(v);
  };

  for (const id of input.extraFallbacks ?? []) {
    add(id);
  }

  if (input.freeMode) {
    for (const id of freeModelsForOpenRouterRouting(
      primary,
      input.extraFallbacks
    )) {
      add(id);
    }
  } else {
    for (const id of RELIABLE_PAID_FALLBACKS) {
      add(id);
    }
  }

  return chain.slice(0, OPENROUTER_MAX_FALLBACK_MODELS);
}

export type OpenRouterProviderOpts = {
  openrouter: {
    models?: string[];
    reasoning?: {
      exclude?: boolean;
      effort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
    };
    provider: {
      allow_fallbacks: boolean;
      sort: "throughput" | "price" | "latency";
      ignore?: string[];
      data_collection?: "allow" | "deny";
    };
  };
};

export function buildOpenRouterProviderOptions(
  input: OpenRouterRoutingInput & { isFreeTier?: boolean }
): OpenRouterProviderOpts {
  const free = Boolean(input.isFreeTier || input.freeMode);
  const fallbacks =
    input.sequentialOnly || !input.primary.trim()
      ? []
      : buildModelFallbackList(input);

  return {
    openrouter: {
      ...(fallbacks.length > 0 && { models: fallbacks }),
      reasoning: { exclude: true },
      provider: {
        allow_fallbacks: !input.sequentialOnly,
        sort: free ? "throughput" : "price",
        ...(free && {
          data_collection: "allow",
          // Venice often rate-limits :free models; prefer other providers.
          ignore: ["Venice"],
        }),
      },
    },
  };
}

export function isRetryableOpenRouterError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isOpenRouterGuardrailError(message) ||
    m.includes("no endpoints found") ||
    m.includes("not found") ||
    m.includes("404") ||
    m.includes("503") ||
    m.includes("502") ||
    m.includes("500") ||
    m.includes("400") ||
    m.includes("rate") ||
    m.includes("timeout") ||
    m.includes("timed out") ||
    m.includes("overloaded") ||
    m.includes("unavailable") ||
    m.includes("provider returned") ||
    m.includes("failed to") ||
    m.includes("empty") ||
    m.includes("kosong") ||
    m.includes("invalid model") ||
    m.includes("model not") ||
    m.includes("aborted") ||
    m.includes("econnreset") ||
    m.includes("fetch failed")
  );
}

export function openRouterErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause =
      err.cause instanceof Error ? err.cause.message : String(err.cause ?? "");
    return `${err.message} ${cause}`.trim();
  }
  return String(err);
}

export function isOpenRouterGuardrailError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("guardrail") ||
    m.includes("data policy") ||
    m.includes("data policies") ||
    m.includes("privacy") ||
    m.includes("no endpoints available")
  );
}

export function isOpenRouterRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("rate-limited") ||
    m.includes("rate limit") ||
    m.includes("429") ||
    m.includes("temporarily rate")
  );
}

export function formatOpenRouterUserError(
  message: string,
  modelId?: string
): string {
  if (isOpenRouterGuardrailError(message)) {
    return `Model gratis diblokir kebijakan privasi OpenRouter. Buka https://openrouter.ai/settings/privacy — pastikan toggle "Free endpoints that may train" dan "may publish prompts" AKTIF (seperti screenshot kamu).`;
  }
  if (
    message.includes("Insufficient credits") ||
    message.includes("402") ||
    message.toLowerCase().includes("credit")
  ) {
    return "Saldo OpenRouter habis. Top up di openrouter.ai atau gunakan mode Gratis.";
  }
  if (isOpenRouterRateLimitError(message)) {
    return `Model gratis sedang antri (rate limit). VANDOR mencoba ${OPENROUTER_FREE_MODEL_POOL.length} model :free bergantian — tunggu ~20 detik, kirim ulang, atau pilih tier Hemat/Seimbang.`;
  }
  if (message.includes("401") || message.toLowerCase().includes("api key")) {
    return "API key OpenRouter invalid. Isi di Pengaturan → API atau OPENROUTER_API_KEY di .env.local.";
  }
  if (isRetryableOpenRouterError(message)) {
    return "Model sementara tidak tersedia. Coba lagi atau pilih tier Hemat/Seimbang.";
  }
  return `Model gagal merespons${modelId ? ` (${modelId})` : ""}. Coba tier lain atau periksa privasi di openrouter.ai/settings/privacy.`;
}

/** Ordered models to try when primary stream fails at startup. */
export function buildAttemptModelChain(
  primary: string,
  fallbacks: string[]
): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    const v = id.trim();
    if (!v || out.includes(v)) return;
    out.push(v);
  };
  add(primary);
  for (const fb of fallbacks) add(fb);
  return out;
}

/** Full sequential chain for tier Gratis — entire pool, stable order first. */
export function buildFreeModeAttemptChain(
  slots: Record<"freeModel1" | "freeModel2" | "freeModel3", string>
): string[] {
  const sanitized = sanitizeFreeModelSlots(slots);
  return buildGratisRotationChain(sanitized);
}
