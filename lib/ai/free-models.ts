/**
 * Curated OpenRouter :free models — ordered for fallback rotation.
 * When one hits rate limit, streamTextWithModelFallback tries the next.
 *
 * @see https://openrouter.ai/models?fmt=cards&input_modalities=text&order=most-popular
 */

/**
 * Full rotation pool (tier Gratis). More stable models first; Kimi K2.6 later
 * because it often errors / rate-limits while still in the chain.
 */
export const OPENROUTER_FREE_MODEL_POOL = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "google/gemma-3-27b-it:free",
  "qwen/qwen3-coder:free",
  "z-ai/glm-4.5-air:free",
  "openai/gpt-oss-20b:free",
  "meta-llama/llama-3.2-90b-vision-instruct:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "moonshotai/kimi-k2.6:free",
  "deepseek/deepseek-r1:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
  "openrouter/free",
] as const;

/** First three — stored in settings slots freeModel1–3. */
export const DEFAULT_FREE_MODEL_CHAIN = [
  OPENROUTER_FREE_MODEL_POOL[0],
  OPENROUTER_FREE_MODEL_POOL[1],
  OPENROUTER_FREE_MODEL_POOL[2],
] as const;

export type OpenRouterFreeModelId =
  (typeof OPENROUTER_FREE_MODEL_POOL)[number];

export function isOpenRouterFreeModelId(id: string): boolean {
  const v = id.toLowerCase().trim();
  return v.includes(":free") || v === "openrouter/free";
}

/** Deduped ordered list: primary first, then pool (legacy / OpenRouter `models[]`). */
export function mergeFreeAttemptChain(
  primary: string,
  extraIds: Iterable<string> = []
): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    const v = id.trim();
    if (!v || !isOpenRouterFreeModelId(v) || out.includes(v)) return;
    out.push(v);
  };
  add(primary);
  for (const id of extraIds) add(id);
  for (const id of OPENROUTER_FREE_MODEL_POOL) add(id);
  return out;
}

/**
 * Tier Gratis — tries every :free model in pool order (no task-pinned primary first).
 */
export function buildGratisRotationChain(
  slots?: Record<"freeModel1" | "freeModel2" | "freeModel3", string>
): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    const v = id.trim();
    if (!v || !isOpenRouterFreeModelId(v) || out.includes(v)) return;
    out.push(v);
  };
  for (const id of OPENROUTER_FREE_MODEL_POOL) add(id);
  if (slots) {
    for (const id of [slots.freeModel1, slots.freeModel2, slots.freeModel3]) {
      add(id);
    }
  }
  return out;
}

/** Up to 3 OpenRouter `models[]` fallbacks (API limit) after primary. */
export function freeModelsForOpenRouterRouting(
  primary: string,
  extraFallbacks?: string[]
): string[] {
  const chain = mergeFreeAttemptChain(primary, [
    ...(extraFallbacks ?? []),
    ...OPENROUTER_FREE_MODEL_POOL,
  ]);
  return chain.filter((id) => id !== primary).slice(0, 3);
}
