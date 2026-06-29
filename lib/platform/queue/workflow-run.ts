import { and, desc, eq, inArray } from "drizzle-orm";
import { platformWorkflowRun } from "@/lib/db/schema";
import { platformConfig } from "../config";
import type { ExecutionPlan, WorkflowRunStatus } from "../core/types";
import { getPlatformDb } from "../db";
import { publishPlatformEvent } from "../events/bus";
import { createWorkflowSteps } from "./workflow-step";

const ACTIVE_FOR_IDEMPOTENCY: WorkflowRunStatus[] = [
  "pending",
  "running",
  "waiting",
];

export type CreateWorkflowRunInput = {
  userId: string;
  chatId?: string | null;
  plan: ExecutionPlan;
  inputSummary?: string;
  /** Cegah duplikat run aktif dengan key yang sama per user. */
  idempotencyKey?: string;
};

export type CreateWorkflowRunResult = {
  runId: string;
  deduped: boolean;
};

export async function createWorkflowRun(
  input: CreateWorkflowRunInput
): Promise<CreateWorkflowRunResult> {
  const db = getPlatformDb();

  if (input.idempotencyKey) {
    const key = input.idempotencyKey.slice(0, 128);
    const existing = await db
      .select({ id: platformWorkflowRun.id })
      .from(platformWorkflowRun)
      .where(
        and(
          eq(platformWorkflowRun.userId, input.userId),
          eq(platformWorkflowRun.idempotencyKey, key),
          inArray(platformWorkflowRun.status, ACTIVE_FOR_IDEMPOTENCY)
        )
      )
      .orderBy(desc(platformWorkflowRun.createdAt))
      .limit(1);

    if (existing[0]) {
      return { runId: existing[0].id, deduped: true };
    }
  }

  const inserted = await db
    .insert(platformWorkflowRun)
    .values({
      userId: input.userId,
      chatId: input.chatId ?? null,
      status: "pending",
      planJson: input.plan,
      inputSummary: input.inputSummary ?? input.plan.summary,
      idempotencyKey: input.idempotencyKey?.slice(0, 128) ?? null,
    })
    .returning({ id: platformWorkflowRun.id });

  const runId = inserted[0].id;

  await createWorkflowSteps({
    runId,
    steps: input.plan.steps,
    defaultMaxAttempts: platformConfig.defaultMaxAttempts,
  });

  await publishPlatformEvent({
    topic: "workflow.created",
    runId,
    payload: {
      summary: input.plan.summary,
      stepCount: input.plan.steps.length,
      idempotencyKey: input.idempotencyKey ?? null,
    },
  });

  return { runId, deduped: false };
}

export async function updateWorkflowRunStatus(
  runId: string,
  status: WorkflowRunStatus,
  patch?: {
    error?: string;
    outputSummary?: string;
    totalTokens?: number;
  }
): Promise<void> {
  const db = getPlatformDb();
  const now = new Date();
  const values: {
    status: WorkflowRunStatus;
    updatedAt: Date;
    error?: string | null;
    outputSummary?: string | null;
    totalTokens?: number;
    startedAt?: Date;
    completedAt?: Date;
  } = {
    status,
    updatedAt: now,
  };

  if (patch?.error !== undefined) {
    values.error = patch.error.slice(0, 2000);
  }
  if (patch?.outputSummary !== undefined) {
    values.outputSummary = patch.outputSummary;
  }
  if (patch?.totalTokens !== undefined) {
    values.totalTokens = patch.totalTokens;
  }
  if (status === "running") {
    values.startedAt = now;
  }
  if (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    values.completedAt = now;
  }

  await db
    .update(platformWorkflowRun)
    .set(values)
    .where(eq(platformWorkflowRun.id, runId));
}

export async function listRecentWorkflowRuns(userId: string, limit = 20) {
  const db = getPlatformDb();
  return db
    .select()
    .from(platformWorkflowRun)
    .where(eq(platformWorkflowRun.userId, userId))
    .orderBy(desc(platformWorkflowRun.createdAt))
    .limit(limit);
}

export async function getWorkflowRunByIdFromQueue(runId: string) {
  const db = getPlatformDb();
  const rows = await db
    .select()
    .from(platformWorkflowRun)
    .where(eq(platformWorkflowRun.id, runId))
    .limit(1);
  return rows[0] ?? null;
}
