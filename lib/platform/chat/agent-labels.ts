import type { PlatformAgentId } from "../core/types";

const LABELS: Record<PlatformAgentId, string> = {
  chat: "Chat Agent",
  planner: "Planner",
  orchestrator: "Orchestrator",
  coding: "Coding Agent",
  browser: "Browser Agent",
  document: "Document Agent",
  memory: "Memory Agent",
  tool: "Tool Agent",
  testing: "Testing Agent",
  fix: "Fix Agent",
  deploy: "Deploy Agent",
  monitoring: "Monitoring Agent",
};

export function platformAgentLabel(agentId: string): string {
  return LABELS[agentId as PlatformAgentId] ?? agentId;
}

export function platformStepLabel(agentId: string, stepKey: string): string {
  return `${platformAgentLabel(agentId)} · ${stepKey.replace(/_/g, " ")}`;
}
