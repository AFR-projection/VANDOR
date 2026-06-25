import type { ChatMessage } from "@/lib/types";
import { sanitizeChatMessageParts } from "@/lib/utils";
import {
  INTENT_LIVE_STATUS,
  toolActivityLabel,
  toolEventMessage,
} from "./labels";
import {
  defaultThinkingTrace,
  toSafeThinkingTrace,
} from "./thinking-trace";
import type {
  AgentActivityEvent,
  AgentActivityState,
  AgentActivityStep,
  AgentActivityUpdate,
  AgentStepStatus,
} from "./types";
import { EMPTY_AGENT_ACTIVITY } from "./types";

function toolStepStatus(state: string): AgentStepStatus {
  if (state === "output-available" || state === "approval-responded") {
    return "completed";
  }
  if (state === "output-error" || state === "output-denied") {
    return "error";
  }
  if (state === "input-available" || state === "input-streaming") {
    return "running";
  }
  if (state === "approval-requested") {
    return "pending";
  }
  return "pending";
}

function upsertStep(
  steps: Map<string, AgentActivityStep>,
  id: string,
  label: string,
  status: AgentStepStatus
) {
  steps.set(id, { id, label, status });
}

function pushEvent(
  events: AgentActivityEvent[],
  message: string,
  level: AgentActivityEventLevel = "info",
  at = Date.now()
) {
  const last = events.at(-1);
  if (last?.message === message) {
    return;
  }
  events.push({
    id: `evt-${at}-${events.length}`,
    message,
    level,
    at,
  });
}

type AgentActivityEventLevel = "info" | "success" | "warn";

function applyActivityUpdate(
  state: AgentActivityState,
  update: AgentActivityUpdate
): AgentActivityState {
  const at = update.at ?? Date.now();
  const next = { ...state };

  if (next.startedAt === null && update.kind !== "done") {
    next.startedAt = at;
    next.phase = "working";
  }

  switch (update.kind) {
    case "status":
      next.liveStatus = update.label;
      break;
    case "step-start":
      next.steps = mergeStep(next.steps, {
        id: update.id,
        label: update.label,
        status: "running",
      });
      break;
    case "step-complete":
      next.steps = next.steps.map((s) =>
        s.id === update.id ? { ...s, status: "completed" as const } : s
      );
      break;
    case "step-error":
      next.steps = next.steps.map((s) =>
        s.id === update.id ? { ...s, status: "error" as const } : s
      );
      if (update.message) {
        next.events = [
          ...next.events,
          {
            id: `evt-${at}-${next.events.length}`,
            message: update.message,
            level: "warn",
            at,
          },
        ];
      }
      break;
    case "event":
      pushEvent(next.events, update.message, update.level ?? "info", at);
      next.events = [...next.events];
      break;
    case "trace": {
      if (!next.thinkingTraces.includes(update.message)) {
        next.thinkingTraces = [...next.thinkingTraces, update.message];
      }
      break;
    }
    case "progress":
      next.progress = Math.min(100, Math.max(0, update.value));
      break;
    case "done":
      next.phase = "complete";
      next.progress = 100;
      next.liveStatus = next.liveStatus || "Selesai";
      break;
    default:
      break;
  }

  return next;
}

function mergeStep(
  steps: AgentActivityStep[],
  step: AgentActivityStep
): AgentActivityStep[] {
  const idx = steps.findIndex((s) => s.id === step.id);
  if (idx === -1) {
    return [...steps, step];
  }
  const copy = [...steps];
  copy[idx] = step;
  return copy;
}

function computeProgress(steps: AgentActivityStep[]): number {
  if (steps.length === 0) {
    return 8;
  }
  const weights = steps.map((s) => {
    if (s.status === "completed") {
      return 1;
    }
    if (s.status === "running") {
      return 0.55;
    }
    if (s.status === "error") {
      return 0.85;
    }
    return 0;
  });
  const sum = weights.reduce<number>((a, b) => a + b, 0);
  return Math.min(96, Math.round((sum / steps.length) * 100));
}

export function deriveAgentActivityFromMessage(
  message: ChatMessage | null | undefined,
  isLoading: boolean
): AgentActivityState {
  if (!message && !isLoading) {
    return EMPTY_AGENT_ACTIVITY;
  }

  const stepsMap = new Map<string, AgentActivityStep>();
  const events: AgentActivityEvent[] = [];
  const thinkingTraces: string[] = [];
  let liveStatus = "Memproses permintaan";
  let startedAt: number | null = null;
  let hasText = false;
  let hasReasoning = false;
  let reasoningStreaming = false;
  let reasoningText = "";

  upsertStep(stepsMap, "understand", "Memahami permintaan", "running");

  const parts = sanitizeChatMessageParts(message?.parts);

  for (const part of parts) {
    if (!part?.type) {
      continue;
    }
    const type = part.type;
    const at =
      "data" in part &&
      part.data &&
      typeof part.data === "object" &&
      "at" in part.data &&
      typeof (part.data as { at?: number }).at === "number"
        ? (part.data as { at: number }).at
        : Date.now();

    if (startedAt === null) {
      startedAt = at;
    }

    if (type === "data-agent-activity" && "data" in part) {
      continue;
    }

    if (type === "data-instant-status" && "data" in part) {
      const data = part.data as { label?: string; phase?: string };
      if (data.phase === "start" && data.label) {
        liveStatus = data.label;
        upsertStep(stepsMap, "understand", "Memahami permintaan", "completed");
        upsertStep(stepsMap, "intent", data.label, "running");
      }
    }

    if (type === "data-memory-recall" && "data" in part) {
      const data = part.data as { active?: boolean; charCount?: number };
      if (data.active) {
        upsertStep(stepsMap, "memory", "Mengambil konteks memori", "completed");
        pushEvent(
          events,
          `Memuat ${data.charCount ?? 0} karakter memori`,
          "info",
          at
        );
        liveStatus = "Mengambil memori";
      }
    }

    if (type === "data-search-status" && "data" in part) {
      const data = part.data as { status?: string; query?: string };
      if (data.status === "searching") {
        liveStatus = "Mencari sumber";
        upsertStep(stepsMap, "web-search", "Mencari sumber", "running");
        if (data.query) {
          pushEvent(events, `Query: ${data.query.slice(0, 80)}`, "info", at);
        }
      } else if (data.status === "complete") {
        upsertStep(stepsMap, "web-search", "Mencari sumber", "completed");
        upsertStep(stepsMap, "read-sources", "Membaca sumber", "running");
        liveStatus = "Membaca sumber";
      }
    }

    if (type === "data-web-sources" && "data" in part) {
      const data = part.data as { sources?: unknown[]; query?: string };
      const count = data.sources?.length ?? 0;
      upsertStep(stepsMap, "read-sources", "Membaca sumber", "completed");
      pushEvent(events, `Menemukan ${count} sumber`, "success", at);
      liveStatus = "Menganalisis informasi";
      upsertStep(stepsMap, "analyze", "Menganalisis informasi", "running");
    }

    if (type === "data-media-download-progress" && "data" in part) {
      const data = part.data as { status?: string; platform?: string };
      const label = data.platform
        ? `Mengunduh dari ${data.platform}`
        : "Mengunduh media";
      const status =
        data.status === "complete"
          ? "completed"
          : data.status === "error"
            ? "error"
            : "running";
      upsertStep(stepsMap, "media-download", label, status);
      liveStatus = label;
    }

    if (type === "reasoning" && "text" in part) {
      hasReasoning = true;
      reasoningStreaming =
        "state" in part ? part.state === "streaming" : false;
      if (part.text?.trim()) {
        reasoningText = part.text;
      }
      upsertStep(stepsMap, "analyze", "Menganalisis informasi", "running");
      liveStatus = "Menganalisis";
    }

    if (type.startsWith("tool-")) {
      const toolName = type.replace(/^tool-/, "");
      const state = String((part as { state?: string }).state ?? "");
      const toolCallId = String(
        (part as { toolCallId?: string }).toolCallId ?? toolName
      );
      const label = toolActivityLabel(toolName);
      upsertStep(stepsMap, toolCallId, label, toolStepStatus(state));
      liveStatus = label;

      const evt = toolEventMessage(toolName, state);
      if (evt) {
        pushEvent(
          events,
          evt,
          state === "output-available" ? "success" : "info",
          at
        );
      }

      if (toolName === "webSearch" && state === "output-available") {
        const output = (part as { output?: { sources?: unknown[] } }).output;
        const count = output?.sources?.length ?? 0;
        if (count > 0) {
          pushEvent(events, `Menemukan ${count} sumber`, "success", at);
        }
      }
    }

    if (type === "text" && "text" in part && part.text?.trim()) {
      hasText = true;
      upsertStep(stepsMap, "understand", "Memahami permintaan", "completed");
      for (const [id, step] of stepsMap) {
        if (
          step.status === "running" &&
          id !== "generate" &&
          !id.startsWith("tool-")
        ) {
          stepsMap.set(id, { ...step, status: "completed" });
        }
      }
      upsertStep(stepsMap, "generate", "Menyusun jawaban", "running");
      liveStatus = "Menyusun jawaban";
    }
  }

  if (hasReasoning) {
    const traces = reasoningText
      ? toSafeThinkingTrace(reasoningText)
      : [defaultThinkingTrace(reasoningStreaming)];
    for (const t of traces) {
      if (!thinkingTraces.includes(t)) {
        thinkingTraces.push(t);
      }
    }
  }

  let state: AgentActivityState = {
    phase: isLoading ? "working" : hasText ? "complete" : "idle",
    liveStatus,
    steps: Array.from(stepsMap.values()),
    events: events.slice(-12),
    thinkingTraces,
    progress: 0,
    startedAt,
  };

  for (const part of parts) {
    if (part.type === "data-agent-activity" && "data" in part) {
      state = applyActivityUpdate(
        state,
        part.data as AgentActivityUpdate
      );
    }
  }

  if (!isLoading && hasText) {
    state.steps = state.steps.map((s) =>
      s.id === "generate" || s.status === "running"
        ? { ...s, status: "completed" as const }
        : s
    );
    state.phase = "complete";
    state.progress = 100;
  } else {
    state.progress = Math.max(
      state.progress,
      computeProgress(state.steps)
    );

    if (isLoading && !hasText && state.steps.length === 1) {
      state.steps[0] = { ...state.steps[0], status: "running" };
    }

    if (isLoading && hasText) {
      state.steps = mergeStep(state.steps, {
        id: "generate",
        label: "Menyusun jawaban",
        status: "running",
      });
    }
  }

  if (isLoading && state.phase === "idle") {
    state.phase = "working";
  }

  return state;
}

export function deriveInitialActivity(
  intent?: string
): AgentActivityState {
  const liveStatus =
    (intent && INTENT_LIVE_STATUS[intent]) || "Memproses permintaan";
  return {
    phase: "working",
    liveStatus,
    steps: [
      { id: "understand", label: "Memahami permintaan", status: "running" },
      { id: "prepare", label: liveStatus, status: "pending" },
      {
        id: "generate",
        label: "Menyusun jawaban",
        status: "pending",
      },
    ],
    events: [],
    thinkingTraces: [],
    progress: 6,
    startedAt: Date.now(),
  };
}

export function mergeActivityUpdates(
  base: AgentActivityState,
  updates: AgentActivityUpdate[]
): AgentActivityState {
  return updates.reduce(applyActivityUpdate, base);
}
