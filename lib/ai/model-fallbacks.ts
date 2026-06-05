import "server-only";

import { RELIABLE_FREE_MODELS } from "@/lib/ai/chat-modes";
import {
  buildModelFallbackList,
  formatOpenRouterUserError,
  isOpenRouterGuardrailError,
} from "@/lib/ai/openrouter-routing";

/** @deprecated use RELIABLE_FREE_MODELS from chat-modes */
export const RELIABLE_CHAT_FALLBACKS = [...RELIABLE_FREE_MODELS];

export function buildChatFallbackChain(
  primary: string,
  defaultFromSettings?: string
): string[] {
  return buildModelFallbackList({
    primary,
    extraFallbacks: defaultFromSettings ? [defaultFromSettings] : [],
  });
}

export { isOpenRouterGuardrailError };

export function formatOpenRouterGuardrailHelp(modelId: string): string {
  return formatOpenRouterUserError("guardrail data policy", modelId);
}

export function formatOpenRouterError(
  message: string,
  modelId?: string
): string {
  return formatOpenRouterUserError(message, modelId);
}
