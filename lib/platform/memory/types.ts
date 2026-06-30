import type { MemoryScope, PlatformAgentId } from "../core/types";

export type AgentMemoryPack = {
  agentId: PlatformAgentId;
  scopes: MemoryScope[];
  byScope: Partial<Record<MemoryScope, string>>;
  context: string;
  itemCount: number;
};

export function readAgentMemoryPack(
  input: Record<string, unknown>
): AgentMemoryPack | null {
  const raw = input._platformMemory;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return raw as AgentMemoryPack;
}
