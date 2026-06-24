import "server-only";

import { detectWebSearchNeed } from "@/lib/search/detect";

export type TaskIntent = "simple" | "reasoning" | "coding" | "research";

const CODING_RE =
  /\b(code|coding|function|class|bug|error|typescript|javascript|python|react|next\.?js|sql|api|refactor|debug|implement|script|compile|stack trace|exception|null pointer|segfault)\b/i;

// Strong structural signals that the message is a coding task even without
// keywords: fenced code blocks, HTML/JSX tags, or file paths/extensions.
const CODE_BLOCK_RE = /```|~~~/;
const CODE_TAG_RE = /<\/?[a-z][\w-]*(\s[^>]*)?>/i;
const FILE_PATH_RE =
  /\b[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|c|cpp|cs|sql|sh|json|ya?ml|css|html?)\b/i;

const REASONING_RE =
  /\b(why|explain|analyze|analysis|compare|plan|strategy|think|reason|pros|cons|evaluate|breakdown|step by step|langkah|kenapa|mengapa|jelaskan|bandingkan|analisa|analisis)\b/i;

// Short comparative/analytical questions like "A atau B, kenapa?" that the
// length heuristic alone would misclassify as simple.
const COMPARATIVE_RE =
  /\b(atau|vs\.?|versus|or)\b/i;

// Multi-step math expressions deserve a stronger reasoning model.
const MATH_RE =
  /\d\s*[+\-*/×÷^%]\s*\d.*[+\-*/×÷^%]|\b(integral|turunan|derivative|persamaan|equation|faktorkan|factorize|solve for|akar kuadrat|logaritma)\b/i;

const SIMPLE_RE =
  /^(hi|halo|hello|thanks|terima kasih|ok|oke|sip|yes|no|ya|tidak)[!.?\s]*$/i;

function looksLikeCode(text: string): boolean {
  return (
    CODE_BLOCK_RE.test(text) ||
    CODE_TAG_RE.test(text) ||
    FILE_PATH_RE.test(text) ||
    CODING_RE.test(text)
  );
}

function looksLikeReasoning(text: string): boolean {
  if (REASONING_RE.test(text) || MATH_RE.test(text)) {
    return true;
  }
  // "A atau B?" style comparisons are analytical even when short.
  if (COMPARATIVE_RE.test(text) && text.includes("?")) {
    return true;
  }
  return text.length > 200 || (text.includes("?") && text.length > 60);
}

export function classifyTaskIntent(
  userText: string,
  options: { webSearchActive?: boolean } = {}
): TaskIntent {
  if (options.webSearchActive || detectWebSearchNeed(userText).needed) {
    return "research";
  }

  const text = userText.trim();
  if (text.length < 40 && SIMPLE_RE.test(text)) {
    return "simple";
  }
  if (looksLikeCode(text)) {
    return "coding";
  }
  if (looksLikeReasoning(text)) {
    return "reasoning";
  }
  return "simple";
}

const MODEL_ROUTES: Record<TaskIntent, string | undefined> = {
  simple: process.env.VANDOR_MODEL_SIMPLE,
  reasoning: process.env.VANDOR_MODEL_REASONING,
  coding: process.env.VANDOR_MODEL_CODING,
  research:
    process.env.VANDOR_MODEL_RESEARCH ?? process.env.VANDOR_WEB_SEARCH_MODEL,
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

export function mergeModelSelection(
  autoResult: { modelId: string; reason: string | null; overridden: boolean },
  routerResult: { modelId: string; reason: string | null },
  userSelectedId: string
): { modelId: string; reason: string | null; overridden: boolean } {
  if (autoResult.overridden) {
    return autoResult;
  }

  // User explicitly picked a model in the UI — honor it (vision/long-context auto still wins above).
  if (userSelectedId.trim()) {
    return { modelId: userSelectedId.trim(), reason: null, overridden: false };
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
