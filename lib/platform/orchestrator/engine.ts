import "server-only";

import { platformConfig } from "../config";
import {
  requireAgent,
  setAgentRuntimeStatus,
} from "../core/agent-registry";
import type { PlatformAgentId } from "../core/types";
import { publishPlatformEvent } from "../events/bus";
import { appendAgentRunLog } from "../queue/queries";
import {
  allStepsCompleted,
  claimNextRunnableStep,
  completeWorkflowStep,
  failWorkflowStep,
  hasFailedSteps,
  markStepRunning,
} from "../queue/workflow-step";
import {
  updateWorkflowRunStatus,
} from "../queue/workflow-run";

export type ProcessWorkflowResult = {
  runId: string;
  status: "completed" | "failed" | "running" | "partial";
  stepsProcessed: number;
  lastError?: string;
};

/**
 * Orchestrator engine — menjalankan step workflow secara sequential.
 * Agent tidak saling memanggil; engine yang dispatch & aggregate.
 */
export async function processWorkflowRun(
  runId: string,
  userId: string,
  chatId: string | null
): Promise<ProcessWorkflowResult> {
  await updateWorkflowRunStatus(runId, "running");
  await publishPlatformEvent({
    topic: "workflow.started",
    runId,
    payload: { userId },
  });

  let stepsProcessed = 0;
  let lastError: string | undefined;
  const maxSteps = platformConfig.maxStepsPerTick;

  while (stepsProcessed < maxSteps) {
    const step = await claimNextRunnableStep(runId);
    if (!step) {
      break;
    }

    const agentId = step.agentId as PlatformAgentId;
    setAgentRuntimeStatus(agentId, "running");

    await publishPlatformEvent({
      topic: "agent.status",
      runId,
      stepId: step.id,
      agentId,
      payload: { status: "running" },
    });

    await markStepRunning(step.id);

    await appendAgentRunLog({
      stepId: step.id,
      message: `Agent ${agentId} started (attempt ${step.attempt + 1})`,
      metadata: { stepKey: step.stepKey },
    });

    let result: { ok: boolean; output?: Record<string, unknown>; error?: string; summary?: string };

    try {
      const agent = requireAgent(agentId);
      result = await agent.execute({
        runId,
        stepId: step.id,
        userId,
        chatId,
        agentId,
        input: (step.input as Record<string, unknown>) ?? {},
        attempt: step.attempt + 1,
      });
    } catch (error) {
      result = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (result.ok) {
      await completeWorkflowStep(step.id, result.output ?? {}, result.summary);
      await appendAgentRunLog({
        stepId: step.id,
        message: result.summary ?? "Step completed",
        metadata: result.output,
      });
      setAgentRuntimeStatus(agentId, "idle");
      await publishPlatformEvent({
        topic: "agent.status",
        runId,
        stepId: step.id,
        agentId,
        payload: { status: "idle" },
      });
    } else {
      const fail = await failWorkflowStep(
        step.id,
        result.error ?? "Unknown error",
        true
      );
      lastError = result.error;
      await appendAgentRunLog({
        stepId: step.id,
        level: "error",
        message: result.error ?? "Step failed",
      });
      setAgentRuntimeStatus(agentId, fail.willRetry ? "waiting" : "error");
      if (!fail.willRetry) {
        break;
      }
    }

    stepsProcessed += 1;
  }

  const failed = await hasFailedSteps(runId);
  const done = await allStepsCompleted(runId);

  if (done) {
    await updateWorkflowRunStatus(runId, "completed", {
      outputSummary: "Workflow completed successfully",
    });
    await publishPlatformEvent({
      topic: "workflow.completed",
      runId,
      payload: { stepsProcessed },
    });
    return { runId, status: "completed", stepsProcessed };
  }

  if (failed) {
    await updateWorkflowRunStatus(runId, "failed", {
      error: lastError ?? "Step failed",
    });
    await publishPlatformEvent({
      topic: "workflow.failed",
      runId,
      payload: { error: lastError },
    });
    return {
      runId,
      status: "failed",
      stepsProcessed,
      lastError,
    };
  }

  return { runId, status: "running", stepsProcessed };
}
