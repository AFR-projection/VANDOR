import "server-only";

import {
  type StreamTextOnStepFinishCallback,
  streamText,
  type ToolSet,
} from "ai";
import { probeFreeOpenRouterModel } from "@/lib/ai/free-model-probe";
import {
  buildAttemptModelChain,
  buildModelFallbackList,
  buildOpenRouterProviderOptions,
  isRetryableOpenRouterError,
  openRouterErrorMessage,
} from "@/lib/ai/openrouter-routing";
import {
  getLanguageModel,
  type OpenRouterClientMeta,
} from "@/lib/ai/providers";

type StreamTextWithFallbackParams<TOOLS extends ToolSet> = Omit<
  Parameters<typeof streamText<TOOLS>>[0],
  "model" | "providerOptions"
> & {
  primaryModelId: string;
  apiKey: string;
  meta?: OpenRouterClientMeta;
  freeMode?: boolean;
  extraFallbacks?: string[];
  /** Override full sequential attempt list (used by Mode Gratis). */
  attemptModelIds?: string[];
  reasoningEffort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
  isFreeTier?: boolean;
};

/**
 * Tries primary model then explicit fallbacks if OpenRouter rejects at stream start.
 * Gratis: probes each :free model, then streams without in-request OpenRouter fallbacks.
 */
export type StreamTextWithFallbackResult<TOOLS extends ToolSet> = {
  stream: Awaited<ReturnType<typeof streamText<TOOLS>>>;
  resolvedModelId: string;
  attemptIndex: number;
  attemptedModels: string[];
};

export async function streamTextWithModelFallback<TOOLS extends ToolSet>(
  params: StreamTextWithFallbackParams<TOOLS>
): Promise<StreamTextWithFallbackResult<TOOLS>> {
  const {
    primaryModelId,
    apiKey,
    meta,
    freeMode,
    extraFallbacks,
    attemptModelIds,
    reasoningEffort,
    isFreeTier,
    messages,
    ...rest
  } = params;

  const fallbackList = buildModelFallbackList({
    primary: primaryModelId,
    extraFallbacks,
    freeMode,
  });

  const attemptModels =
    attemptModelIds && attemptModelIds.length > 0
      ? attemptModelIds
      : buildAttemptModelChain(primaryModelId, fallbackList);

  const sequentialGratis =
    Boolean(freeMode) && attemptModelIds && attemptModelIds.length > 0;

  let lastErr: unknown;
  for (
    let attemptIndex = 0;
    attemptIndex < attemptModels.length;
    attemptIndex++
  ) {
    const modelId = attemptModels[attemptIndex];
    try {
      if (freeMode) {
        await probeFreeOpenRouterModel({
          modelId,
          apiKey,
          meta,
          messages: messages as Parameters<
            typeof probeFreeOpenRouterModel
          >[0]["messages"],
        });
      }

      const perAttemptFallbacks = sequentialGratis
        ? []
        : buildModelFallbackList({
            primary: modelId,
            extraFallbacks: extraFallbacks?.filter((id) => id !== modelId),
            freeMode,
          });

      const providerOptions = buildOpenRouterProviderOptions({
        primary: modelId,
        extraFallbacks: perAttemptFallbacks,
        freeMode,
        isFreeTier,
        sequentialOnly: sequentialGratis,
      });

      if (reasoningEffort) {
        providerOptions.openrouter.reasoning = {
          effort: reasoningEffort,
          exclude: false,
        };
      }

      const stream = await streamText({
        maxRetries: freeMode ? 0 : 1,
        ...rest,
        messages,
        model: getLanguageModel(modelId, apiKey, meta),
        providerOptions,
      } as Parameters<typeof streamText<TOOLS>>[0]);

      return {
        stream,
        resolvedModelId: modelId,
        attemptIndex,
        attemptedModels: attemptModels,
      };
    } catch (err) {
      lastErr = err;
      const msg = openRouterErrorMessage(err);
      if (!isRetryableOpenRouterError(msg)) {
        throw err;
      }
      console.warn(
        `[vandor] gratis rotation ${attemptIndex + 1}/${attemptModels.length} failed for ${modelId}:`,
        msg
      );
    }
  }

  throw lastErr ?? new Error("Semua model gratis gagal merespons");
}

export type { StreamTextOnStepFinishCallback };
