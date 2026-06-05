import "server-only";

import { OPENROUTER_FREE_MODEL_POOL } from "@/lib/ai/free-models";
import type { FileKind } from "@/lib/files/mime";
import { chatModels, getCapabilities, IGNORED_FREE_PROVIDERS } from "./models";

export type AutoSelectInput = {
  /** User-chosen model from the UI (the desired model when no override needed). */
  selectedModelId: string;
  /** Kinds of files attached to the latest user message. */
  attachmentKinds: FileKind[];
  /** Total length of injected text (extracted from attachments + user text). */
  contextChars: number;
  /** Vision model from settings (free or auto). */
  visionModelId?: string;
  /** Long-context model when context exceeds threshold. */
  longContextModelId?: string;
};

export type AutoSelectResult = {
  modelId: string;
  reason: string | null;
  overridden: boolean;
};

/**
 * Curated overrides per task. Always free / cheap by default.
 * If the user has an OpenRouter balance, OpenRouter will fall back to the
 * specified family even when these :free variants are rate-limited because
 * we also pass a `fallbacks` chain.
 */
const VISION_DEFAULT = "moonshotai/kimi-k2.6:free";
const VISION_FALLBACKS = [
  "moonshotai/kimi-k2.6:free",
  "meta-llama/llama-3.2-90b-vision-instruct:free",
  ...OPENROUTER_FREE_MODEL_POOL,
];

const LONG_CONTEXT_DEFAULT = "nvidia/nemotron-3-super-120b-a12b:free";
const LONG_CONTEXT_FALLBACKS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "moonshotai/kimi-k2.6:free",
  ...OPENROUTER_FREE_MODEL_POOL,
];

/** Per-result hint for the streamText `models` fallback array. */
export const fallbacksFor: Record<string, string[] | undefined> = {
  [VISION_DEFAULT]: VISION_FALLBACKS,
  [LONG_CONTEXT_DEFAULT]: LONG_CONTEXT_FALLBACKS,
};

export async function autoSelectModel(
  input: AutoSelectInput
): Promise<AutoSelectResult> {
  const {
    selectedModelId,
    attachmentKinds,
    contextChars,
    visionModelId = VISION_DEFAULT,
    longContextModelId = LONG_CONTEXT_DEFAULT,
  } = input;
  const hasImage = attachmentKinds.includes("image");
  const hasMedia =
    attachmentKinds.includes("video") || attachmentKinds.includes("audio");
  const isLargeContext = contextChars > 25_000;

  // Vision is required when images are attached.
  if (hasImage || hasMedia) {
    const caps = await getCapabilities();
    const userPickHasVision = caps[selectedModelId]?.vision === true;
    if (userPickHasVision) {
      return {
        modelId: selectedModelId,
        reason: null,
        overridden: false,
      };
    }
    return {
      modelId: visionModelId,
      reason: hasImage
        ? "Auto: model dengan kemampuan vision untuk gambar terlampir"
        : "Auto: model multimodal untuk media terlampir",
      overridden: true,
    };
  }

  // Long-context route for big documents.
  if (isLargeContext) {
    // Gemini Flash has 1M ctx; safe pick for >25k chars of attached text.
    if (selectedModelId === longContextModelId) {
      return {
        modelId: selectedModelId,
        reason: null,
        overridden: false,
      };
    }
    return {
      modelId: longContextModelId,
      reason: `Auto: long-context model untuk ${Math.round(contextChars / 1000)}k karakter`,
      overridden: true,
    };
  }

  return { modelId: selectedModelId, reason: null, overridden: false };
}

/** Lookup chatModel descriptor for fallbacks/tier. */
export function getModelDescriptor(modelId: string) {
  return chatModels.find((m) => m.id === modelId);
}

export { IGNORED_FREE_PROVIDERS };
