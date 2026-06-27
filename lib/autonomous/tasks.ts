import { and, asc, desc, eq, lte, or, sql } from "drizzle-orm";
import { agentTask } from "@/lib/db/schema";
import { db } from "./db";

export type EnqueueInput = {
  type: string;
  title: string;
  payload?: unknown;
  goalId?: string | null;
  priority?: number;
  maxAttempts?: number;
  scheduledFor?: Date | null;
  /** Cegah duplikat queued dengan type+title sama. */
  dedupe?: boolean;
};

export async function enqueueTask(
  input: EnqueueInput
): Promise<{ id: string; deduped: boolean }> {
  if (input.dedupe) {
    const existing = await db
      .select({ id: agentTask.id })
      .from(agentTask)
      .where(
        and(
          eq(agentTask.type, input.type),
          eq(agentTask.title, input.title),
          or(
            eq(agentTask.status, "queued"),
            eq(agentTask.status, "running"),
            eq(agentTask.status, "awaiting_approval")
          )
        )
      )
      .limit(1);
    if (existing.length > 0) {
      return { id: existing[0].id, deduped: true };
    }
  }

  const inserted = await db
    .insert(agentTask)
    .values({
      type: input.type,
      title: input.title,
      payload: input.payload ?? null,
      goalId: input.goalId ?? null,
      priority: input.priority ?? 5,
      maxAttempts: input.maxAttempts ?? 3,
      scheduledFor: input.scheduledFor ?? null,
      status: "queued",
    })
    .returning({ id: agentTask.id });
  return { id: inserted[0].id, deduped: false };
}

/** Ambil task siap jalan (queued & jadwal terlewati), urut prioritas. */
export function claimReadyTasks(limit: number) {
  const now = new Date();
  return db
    .select()
    .from(agentTask)
    .where(
      and(
        eq(agentTask.status, "queued"),
        or(
          sql`${agentTask.scheduledFor} IS NULL`,
          lte(agentTask.scheduledFor, now)
        )
      )
    )
    .orderBy(desc(agentTask.priority), asc(agentTask.createdAt))
    .limit(limit);
}

export async function markTaskRunning(id: string): Promise<void> {
  await db
    .update(agentTask)
    .set({
      status: "running",
      startedAt: new Date(),
      attempts: sql`${agentTask.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentTask.id, id));
}

export async function completeTask(id: string, result: unknown): Promise<void> {
  await db
    .update(agentTask)
    .set({
      status: "done",
      result: (result ?? null) as never,
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentTask.id, id));
}

export async function failTask(id: string, error: string): Promise<void> {
  await db
    .update(agentTask)
    .set({
      status: "failed",
      error: error.slice(0, 2000),
      finishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentTask.id, id));
}

export async function setTaskAwaitingApproval(id: string): Promise<void> {
  await db
    .update(agentTask)
    .set({ status: "awaiting_approval", updatedAt: new Date() })
    .where(eq(agentTask.id, id));
}

export function listRecentTasks(limit = 50) {
  return db
    .select()
    .from(agentTask)
    .orderBy(desc(agentTask.createdAt))
    .limit(limit);
}
