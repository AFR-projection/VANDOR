import "server-only";

import type { ModelSlotKey } from "@/lib/ai/model-slots";
import { normalizeModelId } from "@/lib/ai/model-slots";
import {
  inferTierFromLegacySlots,
  type ModelTierId,
  normalizeModelTier,
  slotsFromTier,
} from "@/lib/ai/model-tiers";
import { getUserSettings } from "@/lib/settings/queries";
import { getOpenRouterApiKey } from "@/lib/settings/secrets-queries";
import type { IntegrationsSettings } from "@/lib/settings/types";

export type IntegrationModels = Record<ModelSlotKey, string>;

export type OpenRouterUserContext = {
  apiKey: string | null;
  models: IntegrationModels;
  tier: ModelTierId;
  meta: {
    appName: string;
    appUrl: string;
  };
};

export function resolveTierFromSettings(
  settings: IntegrationsSettings
): ModelTierId {
  if (settings.modelTier) {
    return normalizeModelTier(settings.modelTier);
  }
  return inferTierFromLegacySlots(
    settings as unknown as Record<string, unknown>
  );
}

export function resolveIntegrationModels(
  settings: IntegrationsSettings,
  tierOverride?: string | null
): IntegrationModels {
  const tier = tierOverride
    ? normalizeModelTier(tierOverride)
    : resolveTierFromSettings(settings);
  return slotsFromTier(tier);
}

export async function getOpenRouterContextForUser(
  userId: string,
  tierOverride?: string | null
): Promise<OpenRouterUserContext> {
  const [settings, userKey] = await Promise.all([
    getUserSettings(userId),
    getOpenRouterApiKey(userId),
  ]);

  const envKey = process.env.OPENROUTER_API_KEY?.trim() ?? null;
  const int = settings.integrations;
  const tier = tierOverride
    ? normalizeModelTier(tierOverride)
    : resolveTierFromSettings(int);

  return {
    apiKey: userKey ?? envKey,
    models: slotsFromTier(tier),
    tier,
    meta: {
      appName: int.openrouterAppName.trim() || "VANDOR",
      appUrl:
        int.openrouterAppUrl.trim() ||
        process.env.NEXT_PUBLIC_APP_URL?.trim() ||
        process.env.OPENROUTER_APP_URL?.trim() ||
        "http://localhost:3000",
    },
  };
}

export function pickModel(
  ctx: OpenRouterUserContext,
  slot: ModelSlotKey,
  override?: string | null
): string {
  const chosen = normalizeModelId(override ?? "");
  if (chosen) return chosen;
  return ctx.models[slot];
}
