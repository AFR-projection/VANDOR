import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  platformWorkflowRun,
  platformWorkflowStep,
} from "@/lib/db/schema";
import type { WorkflowRunStatus } from "../core/types";
import { getPlatformDb } from "../db";
import { failWorkflowStep } from "./workflow-step";

const ACTIVE_RUN_STATUSES: WorkflowRunStatus[] = [
  "pending",
  "running",
  "waiting",
];

/** Ambil workflow run yang perlu diproses orchestrator tick. */
export async function claimRunnableWorkflowRuns(limit: number) {
  const db = getPlatformDb();
  return db
    .select()
    .from(platformWorkflowRun)
    .where(inArray(platformWorkflowRun.status, ACTIVE_RUN_STATUSES))
    .orderBy(asc(platformWorkflowRun.createdAt))
    .limit(limit);
}

/** Lock run ke status running (idempotent jika sudah running). */
export async function markWorkflowRunActive(runId: string): Promise<void> {
  const db = getPlatformDb();
  await db
    .update(platformWorkflowRun)
    .set({
      status: "running",
      startedAt: sql`COALESCE(${platformWorkflowRun.startedAt}, NOW())`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(platformWorkflowRun.id, runId),
        inArray(platformWorkflowRun.status, ACTIVE_RUN_STATUSES)
      )
    );
}

export async function countActiveWorkflowRuns(): Promise<number> {
  const db = getPlatformDb();
  const rows = await db
    .select({ id: platformWorkflowRun.id })
    .from(platformWorkflowRun)
    .where(inArray(platformWorkflowRun.status, ACTIVE_RUN_STATUSES));
  return rows.length;
}

/** Step running yang melewati timeout → retry waiting atau failed. */
export async function recoverStaleRunningSteps(
  timeoutMs: number
): Promise<number> {
  if (timeoutMs <= 0) {
    return 0;
  }

  const db = getPlatformDb();
  const cutoff = new Date(Date.now() - timeoutMs);

  const stuck = await db
    .select()
    .from(platformWorkflowStep)
    .where(
      and(
        eq(platformWorkflowStep.status, "running"),
        lte(platformWorkflowStep.startedAt, cutoff)
      )
    )
    .limit(20);

  let recovered = 0;
  for (const step of stuck) {
    await failWorkflowStep(
      step.id,
      `Step timeout — tidak selesai dalam ${timeoutMs}ms`,
      true
    );
    recovered += 1;
  }
  return recovered;
}
