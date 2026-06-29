import "server-only";

import type { VandorIntent } from "@/lib/v4/intent";
import { bootstrapPlatformV2 } from "../init";
import { generateExecutionPlan } from "../planner/generate-plan";
import { processWorkflowRunToCompletion } from "../orchestrator/engine";
import {
  getWorkflowRunById,
  listStepsForRun,
} from "../queue/queries";
import { createWorkflowRun } from "../queue/workflow-run";
import { formatPlatformWorkflowReply } from "./format-response";
import {
  isPlatformChatWorkflowEnabled,
  shouldRouteToPlatformWorkflow,
} from "./routing";

export type PlatformChatDispatchInput = {
  userId: string;
  chatId: string;
  userText: string;
  intent: VandorIntent;
  bypassLlm: boolean;
  attachmentKinds: import("@/lib/files/mime").FileKind[];
  openRouterApiKey: string | null;
  plannerModelId: string;
  openRouterAppUrl?: string;
};

export type PlatformChatDispatchResult = {
  label: string;
  text: string;
  runId: string;
  workflowStatus: string;
  extraParts?: Array<{ type: string; data: unknown }>;
};

/**
 * Chat → Planner → Orchestrator → Chat (Fase 2).
 * Return null jika fast-path (legacy chat route).
 */
export async function tryPlatformChatWorkflow(
  input: PlatformChatDispatchInput
): Promise<PlatformChatDispatchResult | null> {
  if (!isPlatformChatWorkflowEnabled()) {
    return null;
  }

  if (
    !shouldRouteToPlatformWorkflow({
      intent: input.intent,
      userText: input.userText,
      attachmentKinds: input.attachmentKinds,
      bypassLlm: input.bypassLlm,
    })
  ) {
    return null;
  }

  bootstrapPlatformV2();

  const { plan, source } = await generateExecutionPlan({
    userText: input.userText,
    intent: input.intent,
    openRouterApiKey: input.openRouterApiKey,
    modelId: input.plannerModelId,
    appUrl: input.openRouterAppUrl,
  });

  const idempotencyKey = `chat:${input.chatId}:${input.userText.slice(0, 80).replace(/\s+/g, " ").trim()}`;

  const { runId } = await createWorkflowRun({
    userId: input.userId,
    chatId: input.chatId,
    plan,
    inputSummary: plan.summary,
    idempotencyKey,
  });

  const processed = await processWorkflowRunToCompletion(
    runId,
    input.userId,
    input.chatId
  );

  const [run, steps] = await Promise.all([
    getWorkflowRunById(runId),
    listStepsForRun(runId),
  ]);

  const text = formatPlatformWorkflowReply({
    userText: input.userText,
    planSummary: plan.summary,
    planSource: source,
    processed,
    steps,
    run,
  });

  return {
    label: "Multi-Agent Workflow",
    text,
    runId,
    workflowStatus: processed.status,
    extraParts: [
      {
        type: "data-agent-activity",
        data: {
          phase: "done",
          label: `Workflow ${processed.status}`,
          detail: plan.summary,
          runId,
          planSource: source,
          steps: steps.map((s) => ({
            agentId: s.agentId,
            stepKey: s.stepKey,
            status: s.status,
          })),
        },
      },
    ],
  };
}
