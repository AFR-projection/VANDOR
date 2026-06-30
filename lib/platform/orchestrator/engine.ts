import { platformChatMaxSteps, platformConfig } from "../config";
import { requireAgent, setAgentRuntimeStatus } from "../core/agent-registry";
import type { AgentExecutionResult, PlatformAgentId } from "../core/types";
import { publishPlatformEvent } from "../events/bus";
import { buildAgentMemoryContext } from "../memory/context";
import { appendAgentRunLog, listStepsForRun } from "../queue/queries";
import { updateWorkflowRunStatus } from "../queue/workflow-run";
import {
  allStepsCompleted,
  claimNextRunnableStep,
  completeWorkflowStep,
  failWorkflowStep,
  getEarliestStepRetryAt,
  hasFailedSteps,
  hasPendingSteps,
  markStepRunning,
  updateStepMemorySnapshot,
} from "../queue/workflow-step";
import type { WorkflowProgressHandler } from "./progress";
import { StepTimeoutError, withStepTimeout } from "./timeout";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mergeStepInput(
  stepInput: Record<string, unknown>,
  userText?: string
): Record<string, unknown> {
  if (!userText?.trim()) {
    return stepInput;
  }
  const trimmed = userText.trim();
  return {
    ...stepInput,
    userRequest: String(stepInput.userRequest ?? trimmed),
    message: String(stepInput.message ?? stepInput.userRequest ?? trimmed),
    query: String(stepInput.query ?? trimmed),
  };
}

export type ProcessWorkflowResult = {
  runId: string;
  status: "completed" | "failed" | "running" | "waiting";
  stepsProcessed: number;
  lastError?: string;
};

async function loadPriorCompletedSteps(runId: string) {
  const steps = await listStepsForRun(runId);
  return steps
    .filter((s) => s.status === "completed")
    .map((s) => ({
      stepKey: s.stepKey,
      agentId: s.agentId as PlatformAgentId,
      output: (s.output as Record<string, unknown>) ?? {},
    }));
}

async function executeAgentStep(input: {
  runId: string;
  stepId: string;
  userId: string;
  chatId: string | null;
  agentId: PlatformAgentId;
  stepInput: Record<string, unknown>;
  attempt: number;
  priorSteps: Array<{
    stepKey: string;
    agentId: PlatformAgentId;
    output: Record<string, unknown>;
  }>;
}): Promise<AgentExecutionResult> {
  const agent = requireAgent(input.agentId);
  const query = String(
    input.stepInput.userRequest ??
      input.stepInput.message ??
      input.stepInput.query ??
      ""
  ).trim();

  const memoryPack = await buildAgentMemoryContext({
    userId: input.userId,
    chatId: input.chatId,
    runId: input.runId,
    agentId: input.agentId,
    scopes: agent.memoryScopes,
    query,
    priorSteps: input.priorSteps,
  });

  const stepInputWithMemory = {
    ...input.stepInput,
    _platformMemory: memoryPack,
  };

  const execute = () =>
    agent.execute({
      runId: input.runId,
      stepId: input.stepId,
      userId: input.userId,
      chatId: input.chatId,
      agentId: input.agentId,
      input: stepInputWithMemory,
      attempt: input.attempt,
      priorSteps: input.priorSteps,
    });

  await updateStepMemorySnapshot({
    stepId: input.stepId,
    runId: input.runId,
    agentId: input.agentId,
    memoryPack,
  });

  try {
    const result = await withStepTimeout(
      execute(),
      platformConfig.stepTimeoutMs,
      input.agentId
    );
    if (!result.ok) {
      return result;
    }

    const output: Record<string, unknown> = {
      ...(result.output ?? {}),
      _platformMemory: memoryPack,
    };
    if (result.summary) {
      output.summary = result.summary;
    }

    return { ...result, output };
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
  options?: {
    maxSteps?: number;
    userText?: string;
    onProgress?: WorkflowProgressHandler;
  }
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

    options?.onProgress?.({
      type: "step-start",
      stepKey: step.stepKey,
      agentId,
      attempt: step.attempt + 1,
    });

    await appendAgentRunLog({
      stepId: step.id,
      message: `Agent ${agentId} started (attempt ${step.attempt + 1})`,
      metadata: { stepKey: step.stepKey },
    });

    const priorSteps = await loadPriorCompletedSteps(runId);

    const result = await executeAgentStep({
      runId,
      stepId: step.id,
      userId,
      chatId,
      agentId,
      stepInput: mergeStepInput(
        (step.input as Record<string, unknown>) ?? {},
        options?.userText
      ),
      attempt: step.attempt + 1,
      priorSteps,
    });

    if (result.ok) {
      await completeWorkflowStep(step.id, result.output ?? {}, result.summary);
      options?.onProgress?.({
        type: "step-complete",
        stepKey: step.stepKey,
        agentId,
        summary: result.summary,
      });
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
      options?.onProgress?.({
        type: "step-failed",
        stepKey: step.stepKey,
        agentId,
        error: result.error ?? "Unknown error",
        willRetry: fail.willRetry,
      });
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
  chatId: string | null,
  options?: {
    userText?: string;
    onProgress?: WorkflowProgressHandler;
  }
): Promise<ProcessWorkflowResult> {
  const maxSteps = platformChatMaxSteps();
  const waitBudgetMs = Number.parseInt(
    process.env.PLATFORM_CHAT_WAIT_MS ?? "180000",
    10
  );
  const deadline = Date.now() + waitBudgetMs;

  let last: ProcessWorkflowResult = {
    runId,
    status: "running",
    stepsProcessed: 0,
  };

  while (Date.now() < deadline) {
    last = await processWorkflowRun(runId, userId, chatId, {
      maxSteps: platformConfig.maxStepsPerTick,
      userText: options?.userText,
      onProgress: options?.onProgress,
    });

    if (last.status === "completed" || last.status === "failed") {
      return last;
    }

    if (await allStepsCompleted(runId)) {
      await updateWorkflowRunStatus(runId, "completed", {
        outputSummary: "Workflow completed successfully",
      });
      return { runId, status: "completed", stepsProcessed: last.stepsProcessed };
    }

    const retryAt = await getEarliestStepRetryAt(runId);
    if (retryAt && retryAt > Date.now()) {
      const retryInMs = retryAt - Date.now();
      options?.onProgress?.({ type: "waiting-retry", retryInMs });
      await sleep(Math.min(retryInMs + 50, 5000));
      continue;
    }

    if (last.stepsProcessed === 0) {
      const pending = await hasPendingSteps(runId);
      if (pending) {
        await sleep(400);
        continue;
      }
      return last;
    }
  }

  return last;
}
