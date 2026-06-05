import { customProvider } from "ai";
import { getOpenRouterApiKey } from "@/lib/settings/secrets-queries";
import { isTestEnvironment } from "../constants";
import { titleModel } from "./models";
import { createOpenRouterClient, openrouter } from "./openrouter";

export const myProvider = isTestEnvironment
  ? (() => {
      const { chatModel, titleModel: mockTitle } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "title-model": mockTitle,
        },
      });
    })()
  : null;

export type OpenRouterClientMeta = {
  appUrl?: string;
  appName?: string;
};

export function getLanguageModel(
  modelId: string,
  apiKey?: string,
  meta?: OpenRouterClientMeta
) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("chat-model");
  }

  const client = apiKey ? createOpenRouterClient(apiKey, meta) : openrouter;
  return client(modelId);
}

export function getTitleModel(
  apiKey?: string,
  meta?: OpenRouterClientMeta,
  modelId?: string
) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  const client = apiKey ? createOpenRouterClient(apiKey, meta) : openrouter;
  const id = modelId?.trim() || titleModel.id;
  return client(id);
}

export async function resolveOpenRouterApiKeyForUser(
  userId: string
): Promise<string | undefined> {
  const key = await getOpenRouterApiKey(userId);
  return key ?? undefined;
}
