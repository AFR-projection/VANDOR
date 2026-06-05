import {
  DEFAULT_MODEL_TIER,
  displayTierLabel,
  displayTierProvider,
  isFreeTier,
  isOrchestratorTier,
  isVandorTierMode,
  LEGACY_VANDOR_MODE_AUTO,
  LEGACY_VANDOR_MODE_FREE,
  MODEL_TIER_OPTIONS,
  type ModelTierId,
  normalizeModelTier,
  tierCookieValue,
} from "@/lib/ai/model-tiers";

export {
  DEFAULT_MODEL_TIER,
  LEGACY_VANDOR_MODE_AUTO,
  LEGACY_VANDOR_MODE_FREE,
  MODEL_TIER_OPTIONS,
  type ModelTierId,
  tierCookieValue,
};

/** Default chat cookie value */
export const DEFAULT_CHAT_MODE = tierCookieValue(DEFAULT_MODEL_TIER);

/** @deprecated use DEFAULT_CHAT_MODE */
export const VANDOR_MODE_AUTO = LEGACY_VANDOR_MODE_AUTO;
/** @deprecated use tier gratis */
export const VANDOR_MODE_FREE = LEGACY_VANDOR_MODE_FREE;

export type VandorChatMode = ReturnType<typeof tierCookieValue>;

export const CHAT_MODE_OPTIONS = MODEL_TIER_OPTIONS.map((o) => ({
  id: tierCookieValue(o.id),
  label: o.label,
  description: o.description,
  provider: o.provider,
  tier: o.id,
  requiresCredits: o.requiresCredits,
}));

export const SYSTEM_FREE_CHAT_MODEL = "moonshotai/kimi-k2.6:free";
export const SYSTEM_FREE_VISION_MODEL = "moonshotai/kimi-k2.6:free";

/** @deprecated use SYSTEM_FREE_CHAT_MODEL */
export const FREE_TIER_MODEL = SYSTEM_FREE_CHAT_MODEL;

export { OPENROUTER_FREE_MODEL_POOL as RELIABLE_FREE_MODELS } from "@/lib/ai/free-models";

export const RELIABLE_PAID_FALLBACKS = [
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
  "openai/gpt-4o-mini",
] as const;

export function isVandorChatMode(id: string): boolean {
  return isVandorTierMode(id);
}

export { isFreeTier, isOrchestratorTier };

/** @deprecated use isOrchestratorTier */
export function isAutoMode(id: string): boolean {
  return isOrchestratorTier(id);
}

/** @deprecated use isFreeTier */
export function isFreeMode(id: string): boolean {
  return isFreeTier(id);
}

export function normalizeChatMode(id: string): VandorChatMode {
  return tierCookieValue(normalizeModelTier(id));
}

export function displayChatModeLabel(id: string): string {
  return displayTierLabel(id);
}

export function displayChatModeProvider(id: string): string {
  return displayTierProvider(id);
}
