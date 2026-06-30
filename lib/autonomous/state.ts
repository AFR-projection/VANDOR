import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
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

/**
 * Leader election berbasis DB lease — andal di lingkungan connection pooler
 * (Neon/pgbouncer) di mana advisory lock sesi tidak reliabel.
 * Mengembalikan true bila instance ini memegang lease.
 */
export async function acquireLease(
  owner: string,
  ttlMs: number
): Promise<boolean> {
  await getAgentState(); // pastikan baris ada
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);
  const res = await db
    .update(agentState)
    .set({ leaseOwner: owner, leaseExpiresAt: expiresAt, updatedAt: now })
    .where(
      and(
        eq(agentState.id, STATE_ID),
        or(
          isNull(agentState.leaseExpiresAt),
          lt(agentState.leaseExpiresAt, now),
          eq(agentState.leaseOwner, owner)
        )
      )
    )
    .returning({ id: agentState.id });
  return res.length > 0;
}

export async function renewLease(
  owner: string,
  ttlMs: number
): Promise<boolean> {
  const now = new Date();
  const res = await db
    .update(agentState)
    .set({ leaseExpiresAt: new Date(now.getTime() + ttlMs), updatedAt: now })
    .where(and(eq(agentState.id, STATE_ID), eq(agentState.leaseOwner, owner)))
    .returning({ id: agentState.id });
  return res.length > 0;
}

export async function releaseLease(owner: string): Promise<void> {
  await db
    .update(agentState)
    .set({ leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() })
    .where(and(eq(agentState.id, STATE_ID), eq(agentState.leaseOwner, owner)));
}
