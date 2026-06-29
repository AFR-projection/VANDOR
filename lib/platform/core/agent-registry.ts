import type { AgentDefinition } from "./agent-definition";
import type { PlatformAgentId, PlatformAgentStatus } from "./types";

const registry = new Map<PlatformAgentId, AgentDefinition>();

export function registerAgent(def: AgentDefinition): void {
  if (registry.has(def.id)) {
    throw new Error(`Agent '${def.id}' sudah terdaftar.`);
  }
  registry.set(def.id, def);
}

export function getAgent(id: PlatformAgentId): AgentDefinition | undefined {
  return registry.get(id);
}

export function requireAgent(id: PlatformAgentId): AgentDefinition {
  const agent = registry.get(id);
  if (!agent) {
    throw new Error(`Agent '${id}' tidak terdaftar.`);
  }
  return agent;
}

export function listAgents(): AgentDefinition[] {
  return Array.from(registry.values());
}

export function listAgentIds(): PlatformAgentId[] {
  return Array.from(registry.keys());
}

export function setAgentRuntimeStatus(
  id: PlatformAgentId,
  status: PlatformAgentStatus
): void {
  const agent = registry.get(id);
  if (agent) {
    agent.runtimeStatus = status;
  }
}

export function resetAgentRuntimeStatuses(): void {
  for (const agent of registry.values()) {
    agent.runtimeStatus = "idle";
  }
}

export function isAgentRegistryBootstrapped(): boolean {
  return registry.size > 0;
}

/** Ganti definisi agent (upgrade hot-reload fase berikutnya). */
export function replaceAgent(def: AgentDefinition): void {
  registry.set(def.id, def);
}

export function clearAgentRegistry(): void {
  registry.clear();
}
