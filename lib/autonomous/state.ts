import { eq, sql } from "drizzle-orm";
import { type AgentMode, agentState } from "@/lib/db/schema";
import { db } from "./db";

const STATE_ID = "default";

/** Pastikan baris singleton state ada, lalu kembalikan. */
export async function getAgentState() {
  const rows = await db
    .select()
    .from(agentState)
    .where(eq(agentState.id, STATE_ID))
    .limit(1);

  if (rows.length > 0) {
    return rows[0];
  }

  const inserted = await db
    .insert(agentState)
    .values({ id: STATE_ID })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    return inserted[0];
  }

  const again = await db
    .select()
    .from(agentState)
    .where(eq(agentState.id, STATE_ID))
    .limit(1);
  return again[0];
}

/** Update heartbeat + counter tick setiap siklus loop. */
export async function recordHeartbeat(status: string) {
  await db
    .update(agentState)
    .set({
      status,
      lastHeartbeatAt: new Date(),
      lastTickAt: new Date(),
      tickCount: sql`${agentState.tickCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentState.id, STATE_ID));
}

export async function setMode(mode: AgentMode) {
  await db
    .update(agentState)
    .set({ mode, updatedAt: new Date() })
    .where(eq(agentState.id, STATE_ID));
}

export async function setKillSwitch(active: boolean) {
  await db
    .update(agentState)
    .set({ killSwitch: active, updatedAt: new Date() })
    .where(eq(agentState.id, STATE_ID));
}
