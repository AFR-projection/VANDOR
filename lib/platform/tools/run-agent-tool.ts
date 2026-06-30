import { executePlatformTool } from "../core/tool-registry";
import type { AgentExecutionContext, PlatformToolContext } from "../core/types";

export function toToolContext(ctx: AgentExecutionContext): PlatformToolContext {
  return {
    runId: ctx.runId,
    stepId: ctx.stepId,
    userId: ctx.userId,
    chatId: ctx.chatId,
    agentId: ctx.agentId,
    autonomous: false,
  };
}

export async function runAgentTool(
  ctx: AgentExecutionContext,
  toolName: string,
  input: Record<string, unknown> = {}
) {
  return executePlatformTool(toolName, input, toToolContext(ctx));
}
