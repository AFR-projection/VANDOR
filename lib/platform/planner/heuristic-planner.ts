import type { VandorIntent } from "@/lib/v4/intent";
import type { ExecutionPlan, PlatformAgentId } from "../core/types";

function step(
  stepKey: string,
  agentId: PlatformAgentId,
  input?: Record<string, unknown>
) {
  return { stepKey, agentId, input };
}

/** Fallback planner tanpa LLM — intent → agent pipeline deterministik. */
export function buildHeuristicPlan(input: {
  userText: string;
  intent: VandorIntent;
}): ExecutionPlan {
  const text = input.userText.trim();
  const base = { userRequest: text, intent: input.intent };

  switch (input.intent) {
    case "code":
      return {
        summary: "Rencana kode: implementasi → testing",
        steps: [
          step("implement", "coding", base),
          step("verify", "testing", { scope: "code", userRequest: text }),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "operator":
      return {
        summary: "Rencana operator: monitoring sistem live",
        steps: [
          step("monitor", "monitoring", { action: "check_system", userRequest: text }),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "document":
    case "pdf":
      return {
        summary: "Rencana dokumen: generate & rangkum",
        steps: [
          step("document", "document", base),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "search":
    case "map":
      return {
        summary: "Rencana riset: browser agent",
        steps: [
          step("research", "browser", base),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "image":
      return {
        summary: "Rencana media: vision pipeline",
        steps: [
          step("vision", "document", { ...base, media: true }),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "chat_reasoning":
      return {
        summary: "Rencana analisis mendalam",
        steps: [
          step("plan", "planner", base),
          step("memory", "memory", { query: text }),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    default:
      return {
        summary: "Rencana umum multi-agent",
        steps: [
          step("work", "tool", base),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
  }
}
