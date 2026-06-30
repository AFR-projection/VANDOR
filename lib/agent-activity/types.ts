export type AgentStepStatus = "completed" | "running" | "pending" | "error";

export type AgentActivityStep = {
  id: string;
  label: string;
  status: AgentStepStatus;
};

export type AgentActivityEventLevel = "info" | "success" | "warn";

export type AgentActivityEvent = {
  id: string;
  message: string;
  level: AgentActivityEventLevel;
  at: number;
};

export type AgentActivityPhase = "idle" | "working" | "complete";

export type AgentActivityState = {
  phase: AgentActivityPhase;
  liveStatus: string;
  steps: AgentActivityStep[];
  events: AgentActivityEvent[];
  thinkingTraces: string[];
  progress: number;
  startedAt: number | null;
};

export type AgentActivityUpdate =
  | { kind: "status"; label: string; at?: number }
  | { kind: "step-start"; id: string; label: string; at?: number }
  | { kind: "step-complete"; id: string; at?: number }
  | { kind: "step-error"; id: string; message?: string; at?: number }
  | {
      kind: "event";
      message: string;
      level?: AgentActivityEventLevel;
      at?: number;
    }
  | { kind: "trace"; message: string; at?: number }
  | { kind: "progress"; value: number; at?: number }
  | { kind: "done"; at?: number };

export const EMPTY_AGENT_ACTIVITY: AgentActivityState = {
  phase: "idle",
  liveStatus: "",
  steps: [],
  events: [],
  thinkingTraces: [],
  progress: 0,
  startedAt: null,
};
