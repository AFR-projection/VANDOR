import "server-only";

import { chatModels, DEFAULT_CHAT_MODEL } from "./models";

export type TaskIntent = "simple" | "reasoning" | "coding" | "research";

const CODING_RE =
  /\b(code|coding|function|class|bug|error|typescript|javascript|python|react|next\.?js|sql|api|refactor|debug|implement|script)\b/i;

const REASONING_RE =
  /\b(why|explain|analyze|analysis|compare|plan|strategy|think|reason|pros|cons|evaluate|breakdown|step by step|langkah)\b/i;

const SIMPLE_RE =
  /^(hi|halo|hello|thanks|terima kasih|ok|oke|sip|yes|no|ya|tidak)[!.?\s]*$/i;

export function classifyTaskIntent(
  userText: string,
  options: { webSearchActive?: boolean } = {}
): TaskIntent {
  if (options.webSearchActive) {
    return "research";
  }

  const text = userText.trim();
  if (text.length < 40 && SIMPLE_RE.test(text)) {
    return "simple";
  }
  if (CODING_RE.test(text)) {
    return "coding";
  }
  if (REASONING_RE.test(text) || text.length > 200) {
    return "reasoning";
  }
  if (text.includes("?") && text.length > 60) {
    return "reasoning";
  }
  return "simple";
}

const MODEL_ROUTES: Record<TaskIntent, string | undefined> = {
  simple: process.env.VANDOR_MODEL_SIMPLE,
  reasoning: process.env.VANDOR_MODEL_REASONING,
  coding: process.env.VANDOR_MODEL_CODING,
  research: process.env.VANDOR_MODEL_RESEARCH ?? process.env.VANDOR_WEB_SEARCH_MODEL,
};

const DEFAULT_ROUTES: Record<TaskIntent, string> = {
  simple: "meta-llama/llama-3.3-70b-instruct:free",
  reasoning: "meta-llama/llama-3.3-70b-instruct:free",
  coding: "deepseek/deepseek-chat-v3-0324",
  research: "google/gemini-2.0-flash-exp:free",
};

export function routeModelForTask(
  intent: TaskIntent,
  selectedModelId: string
): { modelId: string; reason: string | null } {
  const envModel = MODEL_ROUTES[intent];
  const routed = envModel?.trim() || DEFAULT_ROUTES[intent];

  if (routed === selectedModelId) {
    return { modelId: selectedModelId, reason: null };
  }

  const labels: Record<TaskIntent, string> = {
    simple: "chat ringan → model cepat",
    reasoning: "reasoning → model kuat",
    coding: "coding → model coding",
    research: "research → model + web context",
  };

  return {
    modelId: routed,
    reason: `Router: ${labels[intent]}`,
  };
}

function isFreeTierSelection(modelId: string): boolean {
  if (modelId === DEFAULT_CHAT_MODEL || modelId.includes(":free")) {
    return true;
  }
  const descriptor = chatModels.find((m) => m.id === modelId);
  return descriptor?.tier === "free";
}

export function mergeModelSelection(
  autoResult: { modelId: string; reason: string | null; overridden: boolean },
  routerResult: { modelId: string; reason: string | null },
  userSelectedId: string
): { modelId: string; reason: string | null; overridden: boolean } {
  if (autoResult.overridden) {
    return autoResult;
  }

  if (!isFreeTierSelection(userSelectedId)) {
    return { modelId: userSelectedId, reason: null, overridden: false };
  }

  if (routerResult.modelId === userSelectedId) {
    return { modelId: userSelectedId, reason: null, overridden: false };
  }

  return {
    modelId: routerResult.modelId,
    reason: routerResult.reason,
    overridden: true,
  };
}
