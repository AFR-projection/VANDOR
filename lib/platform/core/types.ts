import type { AgentRiskLevel } from "@/lib/db/schema";

/** Identitas agent V2 — 12 specialist + orchestrator/planner/chat. */
export const PLATFORM_AGENT_IDS = [
  "chat",
  "planner",
  "orchestrator",
  "coding",
  "browser",
  "document",
  "memory",
  "tool",
  "testing",
  "fix",
  "deploy",
  "monitoring",
] as const;

export type PlatformAgentId = (typeof PLATFORM_AGENT_IDS)[number];

export const PLATFORM_AGENT_STATUSES = [
  "idle",
  "running",
  "waiting",
  "error",
] as const;

export type PlatformAgentStatus = (typeof PLATFORM_AGENT_STATUSES)[number];

export const MEMORY_SCOPES = [
  "short_term",
  "long_term",
  "conversation",
  "project",
  "user",
  "knowledge",
] as const;

export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export const TOOL_SOURCES = ["chat", "worker", "skill", "platform"] as const;

export type ToolSource = (typeof TOOL_SOURCES)[number];

export const WORKFLOW_RUN_STATUSES = [
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
] as const;

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[number];

export const WORKFLOW_STEP_STATUSES = [
  "pending",
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "skipped",
  "cancelled",
] as const;

export type WorkflowStepStatus = (typeof WORKFLOW_STEP_STATUSES)[number];

export const PLATFORM_EVENT_TOPICS = [
  "workflow.created",
  "workflow.started",
  "workflow.completed",
  "workflow.failed",
  "step.queued",
  "step.started",
  "step.completed",
  "step.failed",
  "step.retry",
  "agent.status",
  "agent.log",
  "tool.invoked",
  "tool.completed",
  "queue.updated",
  "error.raised",
] as const;

export type PlatformEventTopic = (typeof PLATFORM_EVENT_TOPICS)[number];

/** Metadata tool terdaftar di unified registry (discovery layer). */
export type PlatformToolMeta = {
  name: string;
  description: string;
  source: ToolSource;
  risk: AgentRiskLevel;
  /** Agent yang boleh memanggil tool ini; kosong = semua. */
  agents: PlatformAgentId[];
};

/** Satu langkah dalam execution plan (output Planner). */
export type PlanStep = {
  stepKey: string;
  agentId: PlatformAgentId;
  input?: Record<string, unknown>;
  dependsOn?: string[];
  maxAttempts?: number;
};

export type ExecutionPlan = {
  summary: string;
  steps: PlanStep[];
};

/** Konteks eksekusi agent — semua I/O lewat orchestrator. */
export type AgentExecutionContext = {
  runId: string;
  stepId: string;
  userId: string;
  chatId: string | null;
  agentId: PlatformAgentId;
  input: Record<string, unknown>;
  attempt: number;
};

export type AgentExecutionResult = {
  ok: boolean;
  output?: Record<string, unknown>;
  error?: string;
  summary?: string;
  tokensUsed?: number;
};

export type PlatformToolContext = {
  runId: string | null;
  stepId: string | null;
  userId: string;
  agentId: PlatformAgentId;
  autonomous: boolean;
};

export type PlatformToolExecuteResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  summary?: string;
};
