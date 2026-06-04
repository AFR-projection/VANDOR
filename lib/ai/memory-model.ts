import "server-only";

import type { IntegrationModels } from "@/lib/ai/integration-models";

function isFreeModelId(id: string): boolean {
  const v = id.toLowerCase();
  return v.includes(":free") || v === "openrouter/free";
}

/** Background memory/title jobs — never use unstable free router models. */
export function resolveMemoryExtractionModel(
  models: IntegrationModels
): string {
  const candidates = [
    models.researchModel,
    models.reasoningModel,
    models.chatModel,
    models.longContextModel,
  ]
    .map((m) => m?.trim())
    .filter(Boolean) as string[];

  for (const id of candidates) {
    if (!isFreeModelId(id)) {
      return id;
    }
  }

  return "google/gemini-2.5-flash";
}
