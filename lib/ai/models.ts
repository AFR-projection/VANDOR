import { OPENROUTER_FREE_MODEL_POOL } from "@/lib/ai/free-models";
import { DEFAULT_CHAT_MODE } from "./chat-modes";
import {
  DEFAULT_MODEL_TIER,
  isVandorTierMode,
  normalizeModelTier,
  tierCookieValue,
} from "./model-tiers";

export const DEFAULT_CHAT_MODEL = DEFAULT_CHAT_MODE;

export const titleModel = {
  id: "openrouter/free",
  name: "OpenRouter Free",
  provider: "openrouter",
  description: "Fast model for title generation",
};

/** Provider names di OpenRouter yang sering rate-limit di free tier */
export const IGNORED_FREE_PROVIDERS = ["Venice"] as const;

export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  tier?: "free" | "paid";
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
  /** Fallback model IDs if primary is rate-limited / down */
  fallbacks?: string[];
};

const FREE_FALLBACK_CHAIN = [...OPENROUTER_FREE_MODEL_POOL];

/** Curated favorites — shown first in the UI */
export const chatModels: ChatModel[] = [
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    provider: "meta-llama",
    description: "Default — gratis, support tools & web search",
    tier: "free",
    fallbacks: FREE_FALLBACK_CHAIN.filter(
      (m) => m !== "meta-llama/llama-3.3-70b-instruct:free"
    ),
  },
  {
    id: "openrouter/free",
    name: "Auto (Free)",
    provider: "openrouter",
    description: "Auto-pilih model gratis (tools tidak dijamin)",
    tier: "free",
    fallbacks: FREE_FALLBACK_CHAIN.filter((m) => m !== "openrouter/free"),
  },
  {
    id: "moonshotai/kimi-k2.6:free",
    name: "Kimi K2.6",
    provider: "moonshotai",
    description: "Gratis, flagship Moonshot",
    tier: "free",
    fallbacks: FREE_FALLBACK_CHAIN.filter(
      (m) => m !== "moonshotai/kimi-k2.6:free"
    ),
  },
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    name: "Mistral Dolphin 24B",
    provider: "mistralai",
    description: "Gratis, Mistral-based",
    tier: "free",
    fallbacks: FREE_FALLBACK_CHAIN,
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3",
    provider: "deepseek",
    description: "Murah, sangat capable",
    tier: "paid",
  },
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    description: "Premium — penalaran & tools",
    tier: "paid",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    description: "Premium — multimodal flagship",
    tier: "paid",
  },
  {
    id: "openai/o3-mini",
    name: "o3-mini",
    provider: "openai",
    description: "Reasoning model ringan",
    tier: "paid",
    reasoningEffort: "medium",
  },
  {
    id: "x-ai/grok-3-mini-beta",
    name: "Grok 3 Mini",
    provider: "x-ai",
    description: "Cepat dengan reasoning",
    tier: "paid",
  },
];

type OpenRouterModel = {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  supported_parameters?: string[];
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

function parseCapabilities(model: OpenRouterModel): ModelCapabilities {
  const params = new Set(model.supported_parameters ?? []);
  const inputModalities = new Set(model.architecture?.input_modalities ?? []);

  return {
    tools: params.has("tools") || params.has("tool_choice"),
    vision: inputModalities.has("image"),
    reasoning:
      params.has("reasoning") ||
      params.has("include_reasoning") ||
      model.id.includes(":thinking") ||
      model.id.includes("r1") ||
      model.id.includes("o1") ||
      model.id.includes("o3"),
  };
}

function isFreeModel(model: OpenRouterModel): boolean {
  const prompt = Number.parseFloat(model.pricing?.prompt ?? "1");
  const completion = Number.parseFloat(model.pricing?.completion ?? "1");
  return prompt === 0 && completion === 0;
}

export async function fetchOpenRouterModels(): Promise<OpenRouterModel[]> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
      headers: process.env.OPENROUTER_API_KEY
        ? { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
        : undefined,
    });
    if (!res.ok) {
      return [];
    }
    const json = await res.json();
    return (json.data ?? []) as OpenRouterModel[];
  } catch {
    return [];
  }
}

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  const remote = await fetchOpenRouterModels();
  const capabilities: Record<string, ModelCapabilities> = {};

  for (const model of chatModels) {
    const remoteModel = remote.find((m) => m.id === model.id);
    capabilities[model.id] = remoteModel
      ? parseCapabilities(remoteModel)
      : { tools: true, vision: false, reasoning: false };
  }

  for (const model of remote) {
    if (!capabilities[model.id]) {
      capabilities[model.id] = parseCapabilities(model);
    }
  }

  return capabilities;
}

export const isDemo = process.env.ENABLE_ALL_OPENROUTER_MODELS === "1";

export type OpenRouterModelWithCapabilities = ChatModel & {
  capabilities: ModelCapabilities;
};

export async function getAllOpenRouterModels(): Promise<
  OpenRouterModelWithCapabilities[]
> {
  const remote = await fetchOpenRouterModels();

  return remote
    .filter((m) => m.id.includes("/"))
    .map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.id.split("/")[0],
      description: m.description ?? "",
      tier: isFreeModel(m) ? ("free" as const) : ("paid" as const),
      capabilities: parseCapabilities(m),
    }))
    .sort((a, b) => {
      if (a.tier === "free" && b.tier !== "free") {
        return -1;
      }
      if (b.tier === "free" && a.tier !== "free") {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
}

export function getActiveModels(): ChatModel[] {
  return chatModels;
}

const OPENROUTER_MODEL_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export function isValidModelId(modelId: string): boolean {
  return OPENROUTER_MODEL_ID_PATTERN.test(modelId);
}

let remoteModelIdsCache: Set<string> | null = null;
let remoteModelIdsCacheAt = 0;
const REMOTE_MODEL_CACHE_MS = 3_600_000;

async function getRemoteModelIds(): Promise<Set<string>> {
  const now = Date.now();
  if (
    remoteModelIdsCache &&
    now - remoteModelIdsCacheAt < REMOTE_MODEL_CACHE_MS
  ) {
    return remoteModelIdsCache;
  }
  const remote = await fetchOpenRouterModels();
  remoteModelIdsCache = new Set(remote.map((m) => m.id));
  remoteModelIdsCacheAt = now;
  return remoteModelIdsCache;
}

export async function isAllowedModelId(modelId: string): Promise<boolean> {
  if (!isValidModelId(modelId)) {
    return false;
  }
  const remoteIds = await getRemoteModelIds();
  return remoteIds.has(modelId);
}

/** Resolve user selection; falls back to default if model retired on OpenRouter */
export async function resolveChatModelId(
  selectedModelId: string
): Promise<string> {
  const trimmed = selectedModelId.trim();
  if (!trimmed) {
    return tierCookieValue(DEFAULT_MODEL_TIER);
  }
  if (isVandorTierMode(trimmed)) {
    return tierCookieValue(normalizeModelTier(trimmed));
  }
  if (isValidModelId(trimmed)) {
    return tierCookieValue(DEFAULT_MODEL_TIER);
  }
  return tierCookieValue(DEFAULT_MODEL_TIER);
}

/** @deprecated use isAllowedModelId */
export const allowedModelIds = new Set(chatModels.map((m) => m.id));

export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);
