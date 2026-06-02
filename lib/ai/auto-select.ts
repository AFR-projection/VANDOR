import "server-only";

import { chatModels, getCapabilities, IGNORED_FREE_PROVIDERS } from "./models";
import type { FileKind } from "@/lib/files/mime";

export type AutoSelectInput = {
  /** User-chosen model from the UI (the desired model when no override needed). */
  selectedModelId: string;
  /** Kinds of files attached to the latest user message. */
  attachmentKinds: FileKind[];
  /** Total length of injected text (extracted from attachments + user text). */
  contextChars: number;
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
const VISION_DEFAULT = "meta-llama/llama-3.2-90b-vision-instruct:free";
const VISION_FALLBACKS = [
  "meta-llama/llama-3.2-90b-vision-instruct:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "qwen/qwen-2.5-vl-72b-instruct:free",
  "google/gemini-2.0-flash-exp:free",
];

const LONG_CONTEXT_DEFAULT = "google/gemini-2.0-flash-exp:free";
const LONG_CONTEXT_FALLBACKS = [
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

/** Per-result hint for the streamText `models` fallback array. */
export const fallbacksFor: Record<string, string[] | undefined> = {
  [VISION_DEFAULT]: VISION_FALLBACKS,
  [LONG_CONTEXT_DEFAULT]: LONG_CONTEXT_FALLBACKS,
};

export async function autoSelectModel(
  input: AutoSelectInput
): Promise<AutoSelectResult> {
  const { selectedModelId, attachmentKinds, contextChars } = input;
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
      modelId: VISION_DEFAULT,
      reason: hasImage
        ? "Auto: model dengan kemampuan vision untuk gambar terlampir"
        : "Auto: model multimodal untuk media terlampir",
      overridden: true,
    };
  }

  // Long-context route for big documents.
  if (isLargeContext) {
    // Gemini Flash has 1M ctx; safe pick for >25k chars of attached text.
    if (selectedModelId === LONG_CONTEXT_DEFAULT) {
      return {
        modelId: selectedModelId,
        reason: null,
        overridden: false,
      };
    }
    return {
      modelId: LONG_CONTEXT_DEFAULT,
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
