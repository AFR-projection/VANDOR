import {
  displayTierLabel,
  MODEL_TIER_OPTIONS,
  normalizeModelTier,
  type ModelTierId,
} from "@/lib/ai/model-tiers";

const MODEL_SHORT_NAMES: Record<string, string> = {
  "moonshotai/kimi-k2.6:free": "Kimi K2.6",
  "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3 70B",
  "openai/gpt-oss-120b:free": "GPT-OSS 120B",
  "nvidia/nemotron-3-super-120b-a12b:free": "Nemotron Super",
  "qwen/qwen3-next-80b-a3b-instruct:free": "Qwen3 Next 80B",
  "google/gemma-3-27b-it:free": "Gemma 3 27B",
  "qwen/qwen3-coder:free": "Qwen3 Coder",
  "z-ai/glm-4.5-air:free": "GLM 4.5 Air",
  "openai/gpt-oss-20b:free": "GPT-OSS 20B",
  "meta-llama/llama-3.2-90b-vision-instruct:free": "Llama Vision 90B",
  "nvidia/nemotron-3-nano-30b-a3b:free": "Nemotron Nano",
  "nousresearch/hermes-3-llama-3.1-405b:free": "Hermes 405B",
  "deepseek/deepseek-r1:free": "DeepSeek R1",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free":
    "Dolphin 24B",
  "openrouter/free": "OpenRouter Free",
};

export function displayOpenRouterModelName(modelId: string): string {
  const id = modelId.trim();
  if (MODEL_SHORT_NAMES[id]) return MODEL_SHORT_NAMES[id];
  const slash = id.lastIndexOf("/");
  const tail = slash === -1 ? id : id.slice(slash + 1);
  return tail.replace(/:free$/, " (free)").slice(0, 32);
}

export function displayTierBadgeLabel(tierOrCookie: string): string {
  return displayTierLabel(tierOrCookie);
}

export function tierRequiresCredits(tier: ModelTierId): boolean {
  return (
    MODEL_TIER_OPTIONS.find((o) => o.id === tier)?.requiresCredits ?? false
  );
}

export function describeModelSelection(meta: {
  modelTier?: string;
  modelId: string;
  agentName?: string | null;
  reason?: string | null;
  fallbackUsed?: boolean;
  attemptIndex?: number;
  attemptTotal?: number;
}): string {
  const tier = meta.modelTier
    ? normalizeModelTier(meta.modelTier)
    : null;
  const parts: string[] = [];
  if (tier) parts.push(`Tier ${displayTierLabel(tier)}`);
  if (meta.agentName) parts.push(meta.agentName);
  parts.push(displayOpenRouterModelName(meta.modelId));
  if (meta.fallbackUsed && meta.attemptIndex != null && meta.attemptTotal) {
    parts.push(
      `(cadangan ${meta.attemptIndex + 1}/${meta.attemptTotal})`
    );
  } else if (meta.reason) {
    parts.push(`— ${meta.reason}`);
  }
  return parts.join(" · ");
}
