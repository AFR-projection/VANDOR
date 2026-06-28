import { desc, eq } from "drizzle-orm";
import {
  type AgentGoal,
  type AgentGoalStatus,
  agentGoal,
  agentGoalStatuses,
} from "@/lib/db/schema";
import { db } from "./db";

export type CreateGoalInput = {
  userId?: string | null;
  title: string;
  description?: string | null;
  priority?: number;
  deadline?: Date | null;
  metadata?: unknown;
};

export type UpdateGoalInput = {
  title?: string;
  description?: string | null;
  status?: AgentGoalStatus;
  priority?: number;
  deadline?: Date | null;
  metadata?: unknown;
};

export function listGoals(limit = 50) {
  return db
    .select()
    .from(agentGoal)
    .orderBy(desc(agentGoal.priority), desc(agentGoal.createdAt))
    .limit(limit);
}

export function listActiveGoals(limit = 10) {
  return db
    .select()
    .from(agentGoal)
    .where(eq(agentGoal.status, "active"))
    .orderBy(desc(agentGoal.priority), desc(agentGoal.createdAt))
    .limit(limit);
}

export async function createGoal(input: CreateGoalInput): Promise<AgentGoal> {
  const inserted = await db
    .insert(agentGoal)
    .values({
      userId: input.userId ?? null,
      title: input.title.trim().slice(0, 500),
      description: input.description?.trim().slice(0, 4000) ?? null,
      priority: input.priority ?? 5,
      deadline: input.deadline ?? null,
      metadata: input.metadata ?? null,
      status: "active",
    })
    .returning();
  return inserted[0];
}

export async function updateGoal(
  id: string,
  input: UpdateGoalInput
): Promise<AgentGoal | null> {
  const patch: Partial<typeof agentGoal.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.title !== undefined) {
    patch.title = input.title.trim().slice(0, 500);
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim().slice(0, 4000) ?? null;
  }
  if (input.status !== undefined) {
    if (!agentGoalStatuses.includes(input.status)) {
      return null;
    }
    patch.status = input.status;
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
  }
  if (input.deadline !== undefined) {
    patch.deadline = input.deadline;
  }
  if (input.metadata !== undefined) {
    patch.metadata = input.metadata as never;
  }

  const updated = await db
    .update(agentGoal)
    .set(patch)
    .where(eq(agentGoal.id, id))
    .returning();
  return updated[0] ?? null;
}

export async function deleteGoal(id: string): Promise<boolean> {
  const res = await db
    .delete(agentGoal)
    .where(eq(agentGoal.id, id))
    .returning({ id: agentGoal.id });
  return res.length > 0;
}

export function getGoal(id: string) {
  return db
    .select()
    .from(agentGoal)
    .where(eq(agentGoal.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}
