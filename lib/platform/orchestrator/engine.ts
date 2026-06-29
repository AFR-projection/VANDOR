import { platformChatMaxSteps, platformConfig } from "../config";
import {
  requireAgent,
  setAgentRuntimeStatus,
} from "../core/agent-registry";
import type { AgentExecutionResult, PlatformAgentId } from "../core/types";
import { publishPlatformEvent } from "../events/bus";
import { appendAgentRunLog } from "../queue/queries";
import {
  allStepsCompleted,
  claimNextRunnableStep,
  completeWorkflowStep,
  failWorkflowStep,
  hasFailedSteps,
  hasPendingSteps,
  markStepRunning,
} from "../queue/workflow-step";
import { updateWorkflowRunStatus } from "../queue/workflow-run";
import { StepTimeoutError, withStepTimeout } from "./timeout";

export type ProcessWorkflowResult = {
  runId: string;
  status: "completed" | "failed" | "running" | "waiting";
  stepsProcessed: number;
  lastError?: string;
};

async function executeAgentStep(input: {
  runId: string;
  stepId: string;
  userId: string;
  chatId: string | null;
  agentId: PlatformAgentId;
  stepInput: Record<string, unknown>;
  attempt: number;
}): Promise<AgentExecutionResult> {
  const agent = requireAgent(input.agentId);
  const execute = () =>
    agent.execute({
      runId: input.runId,
      stepId: input.stepId,
      userId: input.userId,
      chatId: input.chatId,
      agentId: input.agentId,
      input: input.stepInput,
      attempt: input.attempt,
    });

  try {
    return await withStepTimeout(
      execute(),
      platformConfig.stepTimeoutMs,
      input.agentId
    );
  } catch (error) {
    if (error instanceof StepTimeoutError) {
      return { ok: false, error: error.message };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Orchestrator engine — menjalankan step workflow secara sequential.
 * Agent tidak saling memanggil; engine yang dispatch & aggregate.
 */
export async function processWorkflowRun(
  runId: string,
  userId: string,
  chatId: string | null,
  options?: { maxSteps?: number }
): Promise<ProcessWorkflowResult> {
  await updateWorkflowRunStatus(runId, "running");
  await publishPlatformEvent({
    topic: "workflow.started",
    runId,
    payload: { userId },
  });

  let stepsProcessed = 0;
  let lastError: string | undefined;
  const maxSteps = options?.maxSteps ?? platformConfig.maxStepsPerTick;

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

    const result = await executeAgentStep({
      runId,
      stepId: step.id,
      userId,
      chatId,
      agentId,
      stepInput: (step.input as Record<string, unknown>) ?? {},
      attempt: step.attempt + 1,
    });

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
        metadata: fail.retryAfter
          ? { retryAfter: fail.retryAfter.toISOString() }
          : undefined,
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
  const pending = await hasPendingSteps(runId);

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

  if (pending) {
    await updateWorkflowRunStatus(runId, "waiting");
    return { runId, status: "waiting", stepsProcessed, lastError };
  }

  return { runId, status: "running", stepsProcessed };
}

/** Proses sampai selesai/gagal — dipakai chat sync (Fase 2). */
export async function processWorkflowRunToCompletion(
  runId: string,
  userId: string,
  chatId: string | null
): Promise<ProcessWorkflowResult> {
  const maxSteps = platformChatMaxSteps();
  let last: ProcessWorkflowResult = {
    runId,
    status: "running",
    stepsProcessed: 0,
  };
  let guard = 0;
  const maxRounds = Math.ceil(maxSteps / platformConfig.maxStepsPerTick) + 2;

  while (guard < maxRounds) {
    last = await processWorkflowRun(runId, userId, chatId, {
      maxSteps: platformConfig.maxStepsPerTick,
    });
    if (last.status === "completed" || last.status === "failed") {
      return last;
    }
    if (last.stepsProcessed === 0) {
      return last;
    }
    guard += 1;
  }

  return last;
}
