import type {
  AgentExecutionContext,
  AgentExecutionResult,
  MemoryScope,
  PlatformAgentId,
  PlatformAgentStatus,
} from "./types";

/**
 * Kontrak agent V2 — setiap agent berdiri sendiri.
 * Komunikasi antar-agent hanya via Orchestrator (tidak import agent lain).
 */
export type AgentDefinition = {
  id: PlatformAgentId;
  name: string;
  description: string;
  capabilities: string[];
  tools: string[];
  memoryScopes: MemoryScope[];
  /** Runtime status (in-memory fase 0; dashboard baca dari DB fase 6). */
  runtimeStatus: PlatformAgentStatus;
  execute: (ctx: AgentExecutionContext) => Promise<AgentExecutionResult>;
};

export type AgentDefinitionInput = Omit<AgentDefinition, "runtimeStatus"> & {
  runtimeStatus?: PlatformAgentStatus;
};

export function defineAgent(input: AgentDefinitionInput): AgentDefinition {
  return {
    ...input,
    runtimeStatus: input.runtimeStatus ?? "idle",
  };
}
