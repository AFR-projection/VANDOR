import type { ModelSlotKey } from "@/lib/ai/model-slots";
import type { FileKind } from "@/lib/files/mime";

export type AgentId =
  | "chat"
  | "research"
  | "coding"
  | "reasoning"
  | "vision"
  | "long-context";

export type AgentSpec = {
  id: AgentId;
  name: string;
  description: string;
  /** Tool names this agent may use (subset enforced in future parallel runs). */
  tools: string[];
  memoryScope: "long-term" | "session";
  modelSlot: ModelSlotKey;
};

export type OrchestratorInput = {
  userText: string;
  attachmentKinds: FileKind[];
  contextChars: number;
  webSearchActive: boolean;
  integrationModels: Record<ModelSlotKey, string>;
};

export type OrchestratorPlan = {
  agentId: AgentId;
  agentName: string;
  modelId: string;
  reason: string;
  /** Agents that can run in parallel with the primary (future). */
  parallelHints: AgentId[];
};
