import "server-only";

import { eq } from "drizzle-orm";
import {
  platformAgentRunLog,
  platformWorkflowRun,
  platformWorkflowStep,
} from "@/lib/db/schema";
import type { PlatformLogLevel } from "@/lib/db/schema";
import { getPlatformDb } from "../db";

export async function appendAgentRunLog(input: {
  stepId: string;
  level?: PlatformLogLevel;
  message: string;
  metadata?: unknown;
}): Promise<void> {
  const db = getPlatformDb();
  await db.insert(platformAgentRunLog).values({
    stepId: input.stepId,
    level: input.level ?? "info",
    message: input.message.slice(0, 4000),
    metadata: input.metadata ?? null,
  });
}

export async function listLogsForStep(stepId: string, limit = 200) {
  const db = getPlatformDb();
  return db
    .select()
    .from(platformAgentRunLog)
    .where(eq(platformAgentRunLog.stepId, stepId))
    .orderBy(platformAgentRunLog.createdAt)
    .limit(limit);
}

export async function getWorkflowRunById(runId: string) {
  const db = getPlatformDb();
  const rows = await db
    .select()
    .from(platformWorkflowRun)
    .where(eq(platformWorkflowRun.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getWorkflowStepById(stepId: string) {
  const db = getPlatformDb();
  const rows = await db
    .select()
    .from(platformWorkflowStep)
    .where(eq(platformWorkflowStep.id, stepId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listStepsForRun(runId: string) {
  const db = getPlatformDb();
  return db
    .select()
    .from(platformWorkflowStep)
    .where(eq(platformWorkflowStep.runId, runId))
    .orderBy(platformWorkflowStep.sortOrder);
}
