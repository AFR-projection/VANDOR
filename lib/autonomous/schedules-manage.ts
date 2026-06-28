import { eq } from "drizzle-orm";
import {
  type AgentSchedule,
  type AgentScheduleKind,
  agentSchedule,
  agentScheduleKinds,
} from "@/lib/db/schema";
import { db } from "./db";

export type CreateScheduleInput = {
  name: string;
  kind: AgentScheduleKind;
  expression: string;
  taskType: string;
  payload?: unknown;
  enabled?: boolean;
};

export type UpdateScheduleInput = Partial<CreateScheduleInput>;

export function listSchedules() {
  return db.select().from(agentSchedule);
}

export async function createSchedule(
  input: CreateScheduleInput
): Promise<AgentSchedule> {
  if (!agentScheduleKinds.includes(input.kind)) {
    throw new Error("kind tidak valid");
  }
  const inserted = await db
    .insert(agentSchedule)
    .values({
      name: input.name.trim().slice(0, 128),
      kind: input.kind,
      expression: input.expression.trim().slice(0, 128),
      taskType: input.taskType.trim().slice(0, 64),
      payload: input.payload ?? null,
      enabled: input.enabled ?? true,
    })
    .returning();
  return inserted[0];
}

export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<AgentSchedule | null> {
  const patch: Partial<typeof agentSchedule.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) {
    patch.name = input.name.trim().slice(0, 128);
  }
  if (input.kind !== undefined) {
    if (!agentScheduleKinds.includes(input.kind)) {
      return null;
    }
    patch.kind = input.kind;
  }
  if (input.expression !== undefined) {
    patch.expression = input.expression.trim().slice(0, 128);
  }
  if (input.taskType !== undefined) {
    patch.taskType = input.taskType.trim().slice(0, 64);
  }
  if (input.payload !== undefined) {
    patch.payload = input.payload as never;
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled;
  }

  const updated = await db
    .update(agentSchedule)
    .set(patch)
    .where(eq(agentSchedule.id, id))
    .returning();
  return updated[0] ?? null;
}

export async function deleteSchedule(id: string): Promise<boolean> {
  const res = await db
    .delete(agentSchedule)
    .where(eq(agentSchedule.id, id))
    .returning({ id: agentSchedule.id });
  return res.length > 0;
}

export function getSchedule(id: string) {
  return db
    .select()
    .from(agentSchedule)
    .where(eq(agentSchedule.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

/** Trigger manual — enqueue task dari jadwal. */
export async function triggerSchedule(id: string): Promise<boolean> {
  const row = await getSchedule(id);
  if (!row) {
    return false;
  }
  const { enqueueTask } = await import("./tasks");
  await enqueueTask({
    type: row.taskType,
    title: `Manual: ${row.name}`,
    payload: row.payload ?? null,
    priority: 6,
    dedupe: false,
  });
  await db
    .update(agentSchedule)
    .set({ lastRunAt: new Date(), updatedAt: new Date() })
    .where(eq(agentSchedule.id, id));
  return true;
}
