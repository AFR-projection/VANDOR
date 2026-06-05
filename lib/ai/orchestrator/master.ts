import "server-only";

import {
  SYSTEM_FREE_CHAT_MODEL,
  SYSTEM_FREE_VISION_MODEL,
} from "@/lib/ai/chat-modes";
import { mergeFreeAttemptChain } from "@/lib/ai/free-models";
import {
  type ModelSlotKey,
  sanitizeFreeModelSlots,
} from "@/lib/ai/model-slots";
import { classifyTaskIntent, type TaskIntent } from "@/lib/ai/router";
import type { FileKind } from "@/lib/files/mime";
import { detectWebSearchNeed } from "@/lib/search/detect";
import { getAgentSpec, SPECIALIST_AGENTS } from "./registry";
import type {
  AgentId,
  AgentSpec,
  OrchestratorInput,
  OrchestratorPlan,
} from "./types";

type Models = OrchestratorInput["integrationModels"];

function raw(models: Models, slot: ModelSlotKey): string {
  return models[slot]?.trim() ?? "";
}

/** Chat Agent model is the inheritance root for empty agent slots. */
function chatModel(models: Models): string {
  return raw(models, "chatModel") || SYSTEM_FREE_CHAT_MODEL;
}

/** Resolve an agent's model: own slot → declared fallbackSlot → Chat Agent. */
function modelForAgent(spec: AgentSpec, models: Models): string {
  const own = raw(models, spec.modelSlot);
  if (own) return own;
  return chatModel(models);
}

function intentToAgent(intent: TaskIntent): AgentId {
  switch (intent) {
    case "research":
      return "research";
    case "coding":
      return "coding";
    case "reasoning":
      return "reasoning";
    default:
      return "chat";
  }
}

/**
 * Master Orchestrator — routes each request to a specialist agent + the
 * OpenRouter model configured for that agent in Pengaturan → Mode Auto.
 */
export function planOrchestrator(input: OrchestratorInput): OrchestratorPlan {
  const {
    userText,
    attachmentKinds,
    contextChars,
    webSearchActive,
    integrationModels: models,
  } = input;

  const hasImage = attachmentKinds.includes("image");
  const hasMedia =
    attachmentKinds.includes("video") || attachmentKinds.includes("audio");
  const isLargeContext = contextChars > 25_000;

  if (hasImage || hasMedia) {
    const agent = getAgentSpec("vision");
    return {
      agentId: "vision",
      agentName: agent.name,
      modelId: modelForAgent(agent, models),
      reason: "Orchestrator: Vision Agent — lampiran gambar/media",
      parallelHints: ["chat"],
    };
  }

  if (isLargeContext) {
    const agent = getAgentSpec("long-context");
    return {
      agentId: "long-context",
      agentName: agent.name,
      modelId: modelForAgent(agent, models),
      reason: `Orchestrator: Long Context Agent — ${Math.round(contextChars / 1000)}k karakter`,
      parallelHints: [],
    };
  }

  const needsLiveData = webSearchActive || detectWebSearchNeed(userText).needed;

  if (needsLiveData) {
    const agent = getAgentSpec("research");
    return {
      agentId: "research",
      agentName: agent.name,
      modelId: modelForAgent(agent, models),
      reason: "Orchestrator: Research Agent — data terkini / web",
      parallelHints: ["chat"],
    };
  }

  const intent = classifyTaskIntent(userText, {
    webSearchActive: needsLiveData,
  });
  const agentId = intentToAgent(intent);
  const agent = getAgentSpec(agentId);

  const labels: Record<TaskIntent, string> = {
    simple: "chat ringan",
    reasoning: "analisis & reasoning",
    coding: "coding & implementasi",
    research: "riset & web search",
  };

  const parallelHints: AgentId[] = [];
  if (agentId === "research") {
    parallelHints.push("chat");
  }
  if (intent === "reasoning" && contextChars > 8000) {
    parallelHints.push("long-context");
  }

  return {
    agentId,
    agentName: agent.name,
    modelId: modelForAgent(agent, models),
    reason: `Orchestrator: ${agent.name} — ${labels[intent]}`,
    parallelHints,
  };
}

function isFreeModelId(id: string): boolean {
  const v = id.toLowerCase();
  return v.includes(":free") || v === "openrouter/free";
}

/** Free-mode chain: freeModel1 → 2 → 3 (sanitized, :free only). */
export function resolveFreeModeChain(models: Models): {
  primary: string;
  fallbacks: string[];
  invalidEntries: string[];
} {
  const before = {
    freeModel1: raw(models, "freeModel1"),
    freeModel2: raw(models, "freeModel2"),
    freeModel3: raw(models, "freeModel3"),
  };
  const invalidEntries = [
    before.freeModel1,
    before.freeModel2,
    before.freeModel3,
  ]
    .filter(Boolean)
    .filter((m) => !isFreeModelId(m));

  const { freeModel1, freeModel2, freeModel3, fixed } =
    sanitizeFreeModelSlots(before);

  const chain = [freeModel1, freeModel2, freeModel3].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );
  const [primary, ...fallbacks] = chain;
  return {
    primary: primary ?? freeModel1,
    fallbacks,
    invalidEntries: [...invalidEntries, ...fixed],
  };
}

function pickFreeSlot(
  models: Models,
  slot: ModelSlotKey,
  fallback: string
): string {
  const id = raw(models, slot);
  return id && isFreeModelId(id) ? id : fallback;
}

export function resolveFreeModeModel(
  attachmentKinds: FileKind[],
  models: Models,
  options?: { userText?: string; contextChars?: number }
): {
  modelId: string;
  fallbacks: string[];
  reason: string | null;
  invalidEntries: string[];
} {
  const {
    primary,
    fallbacks: slotFallbacks,
    invalidEntries,
  } = resolveFreeModeChain(models);
  const chainIds = [primary, ...slotFallbacks].filter(Boolean);
  const hasMedia =
    attachmentKinds.includes("image") ||
    attachmentKinds.includes("video") ||
    attachmentKinds.includes("audio");

  let reason: string | null = null;
  if (invalidEntries.length > 0) {
    reason = `Gratis: ${invalidEntries.join(", ")} bukan model :free — dilewati`;
  }

  let modelId = primary;

  if (hasMedia) {
    modelId = pickFreeSlot(models, "visionModel", primary);
    reason =
      reason ??
      (modelId === primary
        ? "Gratis: Kimi K2.6 (multimodal)"
        : "Gratis: model vision gratis");
  } else if ((options?.contextChars ?? 0) > 80_000) {
    modelId = pickFreeSlot(models, "longContextModel", primary);
    reason = reason ?? "Gratis: Nemotron (konteks panjang)";
  } else if (options?.userText?.trim()) {
    const intent = classifyTaskIntent(options.userText, {
      webSearchActive: false,
    });
    if (intent === "coding") {
      modelId = pickFreeSlot(models, "codingModel", primary);
      reason = reason ?? "Gratis: Nemotron (coding/SWE)";
    } else if (intent === "reasoning") {
      modelId = pickFreeSlot(models, "reasoningModel", primary);
      reason = reason ?? "Gratis: GPT-OSS 120B (reasoning)";
    } else if (intent === "research") {
      modelId = pickFreeSlot(models, "researchModel", primary);
      reason = reason ?? "Gratis: Kimi K2.6 (riset)";
    } else {
      modelId = pickFreeSlot(models, "chatModel", primary);
    }
  } else {
    modelId = pickFreeSlot(models, "chatModel", primary);
  }

  const rotationChain = mergeFreeAttemptChain(modelId, [
    ...chainIds,
    pickFreeSlot(models, "chatModel", primary),
    pickFreeSlot(models, "reasoningModel", primary),
    pickFreeSlot(models, "codingModel", primary),
    pickFreeSlot(models, "visionModel", primary),
    SYSTEM_FREE_VISION_MODEL,
  ]).filter((id) => id !== modelId);

  return {
    modelId,
    fallbacks: rotationChain,
    reason,
    invalidEntries,
  };
}

/** Soft hint when Gratis tier may struggle (does not block the request). */
export function isHeavyForFreeMode(input: {
  userText: string;
  attachmentKinds: FileKind[];
  contextChars: number;
}): { heavy: boolean; reason: string | null } {
  const { contextChars } = input;

  if (contextChars > 200_000) {
    return {
      heavy: true,
      reason: "konteks sangat panjang (>200k) — pertimbangkan tier Seimbang",
    };
  }
  return { heavy: false, reason: null };
}

export { SPECIALIST_AGENTS };
