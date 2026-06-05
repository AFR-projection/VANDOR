import {
  DEFAULT_FREE_MODEL_CHAIN,
  type ModelSlotKey,
  sanitizeFreeModelSlots,
} from "@/lib/ai/model-slots";

export const MODEL_TIER_IDS = [
  "gratis",
  "hemat",
  "seimbang",
  "premium",
] as const;

export type ModelTierId = (typeof MODEL_TIER_IDS)[number];

export const DEFAULT_MODEL_TIER: ModelTierId = "seimbang";

export const VANDOR_TIER_PREFIX = "vandor/tier:" as const;

/** @deprecated legacy cookie values */
export const LEGACY_VANDOR_MODE_AUTO = "vandor/auto" as const;
export const LEGACY_VANDOR_MODE_FREE = "vandor/free" as const;

export type TierPreset = Record<ModelSlotKey, string>;

const EMBEDDING = "openai/text-embedding-3-small";

const FREE_CHAIN = {
  freeModel1: DEFAULT_FREE_MODEL_CHAIN[0],
  freeModel2: DEFAULT_FREE_MODEL_CHAIN[1],
  freeModel3: DEFAULT_FREE_MODEL_CHAIN[2],
} as const;

/** Resolved OpenRouter IDs per tier — single source of truth. */
export const MODEL_TIER_PRESETS: Record<ModelTierId, TierPreset> = {
  gratis: {
    ...FREE_CHAIN,
    chatModel: "meta-llama/llama-3.3-70b-instruct:free",
    reasoningModel: "openai/gpt-oss-120b:free",
    codingModel: "nvidia/nemotron-3-super-120b-a12b:free",
    researchModel: "meta-llama/llama-3.3-70b-instruct:free",
    visionModel: "meta-llama/llama-3.2-90b-vision-instruct:free",
    longContextModel: "nvidia/nemotron-3-super-120b-a12b:free",
    imageModel: "google/gemini-2.5-flash-image",
    videoModel: "",
    voiceModel: "",
    transcriptionModel: "",
    documentModel: "nvidia/nemotron-3-super-120b-a12b:free",
    embeddingModel: EMBEDDING,
    rerankModel: "",
    titleModel: "meta-llama/llama-3.3-70b-instruct:free",
  },
  hemat: {
    ...FREE_CHAIN,
    chatModel: "google/gemini-2.0-flash-001",
    reasoningModel: "deepseek/deepseek-chat-v3-0324",
    codingModel: "anthropic/claude-haiku-4.5",
    researchModel: "google/gemini-2.0-flash-001",
    visionModel: "google/gemini-2.0-flash-001",
    longContextModel: "google/gemini-2.0-flash-001",
    imageModel: "google/gemini-2.5-flash-image",
    videoModel: "",
    voiceModel: "",
    transcriptionModel: "",
    documentModel: "anthropic/claude-haiku-4.5",
    embeddingModel: EMBEDDING,
    rerankModel: "",
    titleModel: "google/gemini-2.0-flash-001",
  },
  seimbang: {
    ...FREE_CHAIN,
    chatModel: "google/gemini-2.5-flash",
    reasoningModel: "google/gemini-2.5-flash",
    codingModel: "anthropic/claude-haiku-4.5",
    researchModel: "google/gemini-2.5-flash",
    visionModel: "google/gemini-2.5-flash",
    longContextModel: "google/gemini-2.5-flash",
    imageModel: "google/gemini-2.5-flash-image",
    videoModel: "",
    voiceModel: "",
    transcriptionModel: "",
    documentModel: "anthropic/claude-haiku-4.5",
    embeddingModel: EMBEDDING,
    rerankModel: "",
    titleModel: "google/gemini-2.0-flash-001",
  },
  premium: {
    ...FREE_CHAIN,
    chatModel: "anthropic/claude-sonnet-4",
    reasoningModel: "openai/o3-mini",
    codingModel: "anthropic/claude-sonnet-4",
    researchModel: "anthropic/claude-sonnet-4",
    visionModel: "openai/gpt-4o",
    longContextModel: "google/gemini-2.5-flash",
    imageModel: "google/gemini-2.5-flash-image",
    videoModel: "",
    voiceModel: "",
    transcriptionModel: "",
    documentModel: "anthropic/claude-sonnet-4",
    embeddingModel: EMBEDDING,
    rerankModel: "",
    titleModel: "openai/gpt-4o-mini",
  },
};

export const MODEL_TIER_OPTIONS = [
  {
    id: "gratis" as const,
    label: "Gratis",
    shortLabel: "Gratis",
    description: "15+ model :free — otomatis ganti jika satu kena rate limit.",
    provider: "moonshotai",
    requiresCredits: false,
  },
  {
    id: "hemat" as const,
    label: "Hemat",
    shortLabel: "Hemat",
    description:
      "Model murah & stabil (Flash, Haiku, DeepSeek). Butuh saldo OpenRouter.",
    provider: "google",
    requiresCredits: true,
  },
  {
    id: "seimbang" as const,
    label: "Seimbang",
    shortLabel: "Seimbang",
    description:
      "Default harian — Gemini Flash + Haiku untuk kode. Orchestrator aktif.",
    provider: "google",
    requiresCredits: true,
  },
  {
    id: "premium" as const,
    label: "Premium",
    shortLabel: "Premium",
    description:
      "Claude Sonnet, GPT-4o, o3-mini — tugas berat & multimodal premium.",
    provider: "anthropic",
    requiresCredits: true,
  },
] as const;

export function tierCookieValue(tier: ModelTierId): string {
  return `${VANDOR_TIER_PREFIX}${tier}`;
}

export function isModelTierId(value: string): value is ModelTierId {
  return (MODEL_TIER_IDS as readonly string[]).includes(value);
}

export function isTierCookieValue(id: string): boolean {
  return id.startsWith(VANDOR_TIER_PREFIX);
}

export function parseTierFromCookie(id: string): ModelTierId | null {
  if (!id.startsWith(VANDOR_TIER_PREFIX)) return null;
  const tier = id.slice(VANDOR_TIER_PREFIX.length);
  return isModelTierId(tier) ? tier : null;
}

/**
 * Normalize chat cookie / API selection to a tier id.
 * Migrates legacy vandor/auto → seimbang, vandor/free → gratis.
 */
export function normalizeModelTier(id: string): ModelTierId {
  const trimmed = id.trim();
  const fromCookie = parseTierFromCookie(trimmed);
  if (fromCookie) return fromCookie;
  if (trimmed === LEGACY_VANDOR_MODE_FREE || trimmed === "free") {
    return "gratis";
  }
  if (
    trimmed === LEGACY_VANDOR_MODE_AUTO ||
    trimmed === "auto" ||
    trimmed === "vandor/auto"
  ) {
    return "seimbang";
  }
  if (isModelTierId(trimmed)) return trimmed;
  return DEFAULT_MODEL_TIER;
}

export function isVandorTierMode(id: string): boolean {
  const t = id.trim();
  return (
    isTierCookieValue(t) ||
    t === LEGACY_VANDOR_MODE_AUTO ||
    t === LEGACY_VANDOR_MODE_FREE ||
    isModelTierId(t)
  );
}

export function isFreeTier(id: string): boolean {
  return normalizeModelTier(id) === "gratis";
}

/** Paid tiers use orchestrator + agent slots. */
export function isOrchestratorTier(id: string): boolean {
  return !isFreeTier(id);
}

export function displayTierLabel(id: string): string {
  const tier = normalizeModelTier(id);
  return MODEL_TIER_OPTIONS.find((o) => o.id === tier)?.label ?? tier;
}

export function displayTierProvider(id: string): string {
  const tier = normalizeModelTier(id);
  return (
    MODEL_TIER_OPTIONS.find((o) => o.id === tier)?.provider ?? "openrouter"
  );
}

export function slotsFromTier(tier: ModelTierId): TierPreset {
  const preset = { ...MODEL_TIER_PRESETS[tier] };
  const sanitized = sanitizeFreeModelSlots({
    freeModel1: preset.freeModel1,
    freeModel2: preset.freeModel2,
    freeModel3: preset.freeModel3,
  });
  return {
    ...preset,
    freeModel1: sanitized.freeModel1,
    freeModel2: sanitized.freeModel2,
    freeModel3: sanitized.freeModel3,
  };
}

export function inferTierFromLegacySlots(
  raw: Record<string, unknown>
): ModelTierId {
  const chat = String(
    raw.chatModel ?? raw.defaultChatModel ?? ""
  ).toLowerCase();
  const free1 = String(raw.freeModel1 ?? raw.freeChatModel ?? "").toLowerCase();

  if (
    free1.includes(":free") ||
    free1 === "openrouter/free" ||
    chat.includes(":free")
  ) {
    if (
      chat.includes("claude-sonnet") ||
      chat.includes("gpt-4o") ||
      chat.includes("o3")
    ) {
      return "premium";
    }
    if (
      chat.includes("haiku") ||
      chat.includes("mini") ||
      chat.includes("deepseek")
    ) {
      return "hemat";
    }
    return "gratis";
  }

  if (
    chat.includes("claude-sonnet") ||
    chat.includes("gpt-4o") ||
    chat.includes("o3-mini")
  ) {
    return "premium";
  }

  if (
    chat.includes("haiku") ||
    chat.includes("gpt-4o-mini") ||
    chat.includes("deepseek") ||
    chat.includes("2.0-flash")
  ) {
    return "hemat";
  }

  return DEFAULT_MODEL_TIER;
}
