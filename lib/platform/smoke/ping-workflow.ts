import "server-only";

import type { PlatformWorkflowStep } from "@/lib/db/schema";
import type { ExecutionPlan } from "../core/types";
import { bootstrapPlatformV2 } from "../init";
import { processWorkflowRun } from "../orchestrator/engine";
import { createWorkflowRun } from "../queue/workflow-run";
import { getWorkflowRunById, listStepsForRun } from "../queue/queries";

export type PingWorkflowResult = {
  ok: boolean;
  runId: string;
  status: string;
  stepsProcessed: number;
  steps: Array<{ stepKey: string; agentId: string; status: string }>;
  error?: string;
};

/**
 * Smoke test end-to-end: create run → orchestrator ping → complete.
 * Membuktikan pipeline platform V2 (DB + event bus + agent registry).
 */
export async function runPingWorkflow(input: {
  userId: string;
  chatId?: string | null;
}): Promise<PingWorkflowResult> {
  bootstrapPlatformV2();

  const plan: ExecutionPlan = {
    summary: "Platform V2 smoke ping",
    steps: [
      {
        stepKey: "orchestrator-ping",
        agentId: "orchestrator",
        input: { action: "ping" },
      },
    ],
  };

  const { runId } = await createWorkflowRun({
    userId: input.userId,
    chatId: input.chatId ?? null,
    plan,
    inputSummary: plan.summary,
    idempotencyKey: `smoke-ping:${input.userId}`,
  });

  const processed = await processWorkflowRun(
    runId,
    input.userId,
    input.chatId ?? null
  );

  const run = await getWorkflowRunById(runId);
  const steps = await listStepsForRun(runId);

  return {
    ok: processed.status === "completed",
    runId,
    status: run?.status ?? processed.status,
    stepsProcessed: processed.stepsProcessed,
    steps: steps.map((s: PlatformWorkflowStep) => ({
      stepKey: s.stepKey,
      agentId: s.agentId,
      status: s.status,
    })),
    error: processed.lastError,
  };
}
