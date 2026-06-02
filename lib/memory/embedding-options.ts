import "server-only";

import { getOpenRouterApiKey } from "@/lib/settings/secrets-queries";
import { getUserSettings } from "@/lib/settings/queries";

export async function getEmbeddingOptionsForUser(userId: string): Promise<{
  apiKey: string | null;
  model: string;
}> {
  const [apiKey, settings] = await Promise.all([
    getOpenRouterApiKey(userId),
    getUserSettings(userId),
  ]);

  const model =
    settings.integrations.embeddingModel.trim() ||
    process.env.MEMORY_EMBEDDING_MODEL?.trim() ||
    "openai/text-embedding-3-small";

  return { apiKey, model };
}
