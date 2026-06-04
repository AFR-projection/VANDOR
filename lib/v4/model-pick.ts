import "server-only";

import type { IntegrationModels } from "@/lib/ai/integration-models";
import type { VandorIntent } from "@/lib/v4/intent";

/**
 * Prefer fast/cheap chat slot for turns that don't need a heavy reasoning model.
 */
export function applyV4ModelBias(input: {
  modelId: string;
  intent: VandorIntent;
  models: IntegrationModels;
  webSearchPreloaded: boolean;
  useOrchestrator: boolean;
}): { modelId: string; reason: string | null } {
  const fast =
    input.models.chatModel?.trim() ||
    input.models.freeModel1?.trim() ||
    "";

  if (!fast || !input.useOrchestrator) {
    return { modelId: input.modelId, reason: null };
  }

  const lightIntents: VandorIntent[] = [
    "chat_simple",
    "time",
    "weather",
    "task",
    "notes",
    "memory",
    "map",
  ];

  if (lightIntents.includes(input.intent)) {
    return {
      modelId: fast,
      reason: "V4: model cepat — intent ringan",
    };
  }

  if (input.intent === "search" && input.webSearchPreloaded) {
    return {
      modelId: fast,
      reason: "V4: sintesis singkat — kartu SUMBER sudah di UI",
    };
  }

  return { modelId: input.modelId, reason: null };
}
