import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { platformWorkflowStep } from "@/lib/db/schema";
import type { PlanStep, WorkflowStepStatus } from "../core/types";
import { getPlatformDb } from "../db";
import { publishPlatformEvent } from "../events/bus";
import { retryAfterDate } from "../orchestrator/retry";

export async function createWorkflowSteps(input: {
  runId: string;
  steps: PlanStep[];
  defaultMaxAttempts: number;
}): Promise<void> {
  if (input.steps.length === 0) {
    return;
  }
  const db = getPlatformDb();
  await db.insert(platformWorkflowStep).values(
    input.steps.map((step, index) => ({
      runId: input.runId,
      agentId: step.agentId,
      stepKey: step.stepKey,
      status: "queued" as const,
      input: step.input ?? null,
      maxAttempts: step.maxAttempts ?? input.defaultMaxAttempts,
      sortOrder: index,
    }))
  );

  await publishPlatformEvent({
    topic: "queue.updated",
    runId: input.runId,
    payload: { queuedSteps: input.steps.length },
  });
}

function runnableStepFilter(runId: string, now: Date) {
  return and(
    eq(platformWorkflowStep.runId, runId),
    or(
      inArray(platformWorkflowStep.status, ["queued", "pending"]),
      and(
        eq(platformWorkflowStep.status, "waiting"),
        or(
          isNull(platformWorkflowStep.retryAfter),
          lte(platformWorkflowStep.retryAfter, now)
        )
      )
    )
  );
}

export async function claimNextRunnableStep(runId: string) {
  const db = getPlatformDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(platformWorkflowStep)
    .where(runnableStepFilter(runId, now))
    .orderBy(asc(platformWorkflowStep.sortOrder))
    .limit(1);
  return rows[0] ?? null;
}

export async function markStepRunning(stepId: string): Promise<void> {
  const db = getPlatformDb();
  const now = new Date();
  const updated = await db
    .update(platformWorkflowStep)
    .set({
      status: "running",
      attempt: sql`${platformWorkflowStep.attempt} + 1`,
      retryAfter: null,
      startedAt: now,
      updatedAt: now,
    })
    .where(eq(platformWorkflowStep.id, stepId))
    .returning({
      id: platformWorkflowStep.id,
      runId: platformWorkflowStep.runId,
      agentId: platformWorkflowStep.agentId,
      attempt: platformWorkflowStep.attempt,
    });

  const row = updated[0];
  if (!row) {
    return;
  }

  await publishPlatformEvent({
    topic: "step.started",
    runId: row.runId,
    stepId: row.id,
    agentId: row.agentId,
    payload: { attempt: row.attempt },
  });
}

export async function completeWorkflowStep(
  stepId: string,
  output: unknown,
  summary?: string
): Promise<void> {
  const db = getPlatformDb();
  const now = new Date();
  const updated = await db
    .update(platformWorkflowStep)
    .set({
      status: "completed",
      output: (output ?? null) as never,
      error: null,
      retryAfter: null,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(platformWorkflowStep.id, stepId))
    .returning({
      runId: platformWorkflowStep.runId,
      agentId: platformWorkflowStep.agentId,
    });

  const row = updated[0];
  if (!row) {
    return;
  }

  await publishPlatformEvent({
    topic: "step.completed",
    runId: row.runId,
    stepId,
    agentId: row.agentId,
    payload: { summary },
  });
}

export async function failWorkflowStep(
  stepId: string,
  error: string,
  retryable: boolean
): Promise<{ willRetry: boolean; retryAfter?: Date }> {
  const db = getPlatformDb();
  const rows = await db
    .select()
    .from(platformWorkflowStep)
    .where(eq(platformWorkflowStep.id, stepId))
    .limit(1);
  const step = rows[0];
  if (!step) {
    return { willRetry: false };
  }

  const willRetry = retryable && step.attempt < step.maxAttempts;
  const now = new Date();
  const nextRetry = willRetry ? retryAfterDate(step.attempt) : null;

  await db
    .update(platformWorkflowStep)
    .set({
      status: willRetry ? "waiting" : "failed",
      error: error.slice(0, 2000),
      retryAfter: nextRetry,
      completedAt: willRetry ? null : now,
      updatedAt: now,
    })
    .where(eq(platformWorkflowStep.id, stepId));

  await publishPlatformEvent({
    topic: willRetry ? "step.retry" : "step.failed",
    runId: step.runId,
    stepId,
    agentId: step.agentId,
    payload: {
      error,
      attempt: step.attempt,
      willRetry,
      retryAfter: nextRetry?.toISOString(),
    },
  });

  if (!willRetry) {
    await publishPlatformEvent({
      topic: "error.raised",
      runId: step.runId,
      stepId,
      agentId: step.agentId,
      payload: { error },
    });
  }

  return { willRetry, retryAfter: nextRetry ?? undefined };
}

export async function countStepsByStatus(runId: string) {
  const db = getPlatformDb();
  const steps = await db
    .select({
      status: platformWorkflowStep.status,
    })
    .from(platformWorkflowStep)
    .where(eq(platformWorkflowStep.runId, runId));

  const counts: Record<WorkflowStepStatus, number> = {
    pending: 0,
    queued: 0,
    running: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
  };

  for (const s of steps) {
    counts[s.status as WorkflowStepStatus] += 1;
  }
  return counts;
}

export async function hasFailedSteps(runId: string): Promise<boolean> {
  const counts = await countStepsByStatus(runId);
  return counts.failed > 0;
}

export async function allStepsCompleted(runId: string): Promise<boolean> {
  const counts = await countStepsByStatus(runId);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return total > 0 && counts.completed === total;
}

export async function hasPendingSteps(runId: string): Promise<boolean> {
  const counts = await countStepsByStatus(runId);
  return (
    counts.pending +
      counts.queued +
      counts.running +
      counts.waiting >
    0
  );
}
