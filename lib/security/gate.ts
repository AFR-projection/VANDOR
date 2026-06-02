import "server-only";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { gateLockout, gateSession } from "@/lib/db/schema";
import { GATE_BAN_MS, GATE_MAX_ATTEMPTS } from "./gate-edge";

export * from "./gate-edge";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export type LockoutStatus = {
  locked: boolean;
  lockedUntil: number | null;
  attemptsLeft: number;
};

export async function getLockoutStatus(ip: string): Promise<LockoutStatus> {
  if (!process.env.POSTGRES_URL) {
    return {
      locked: false,
      lockedUntil: null,
      attemptsLeft: GATE_MAX_ATTEMPTS,
    };
  }
  try {
    const rows = await db
      .select()
      .from(gateLockout)
      .where(eq(gateLockout.ip, ip))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return {
        locked: false,
        lockedUntil: null,
        attemptsLeft: GATE_MAX_ATTEMPTS,
      };
    }
    const now = Date.now();
    if (row.lockedUntil && row.lockedUntil.getTime() > now) {
      return {
        locked: true,
        lockedUntil: row.lockedUntil.getTime(),
        attemptsLeft: 0,
      };
    }
    return {
      locked: false,
      lockedUntil: null,
      attemptsLeft: Math.max(0, GATE_MAX_ATTEMPTS - row.failedAttempts),
    };
  } catch (error) {
    console.error("getLockoutStatus error:", error);
    return {
      locked: false,
      lockedUntil: null,
      attemptsLeft: GATE_MAX_ATTEMPTS,
    };
  }
}

export async function recordFailedAttempt(ip: string): Promise<LockoutStatus> {
  if (!process.env.POSTGRES_URL) {
    return {
      locked: false,
      lockedUntil: null,
      attemptsLeft: GATE_MAX_ATTEMPTS,
    };
  }
  try {
    const banMs = GATE_BAN_MS;
    const maxAttempts = GATE_MAX_ATTEMPTS;
    const rows = await db
      .insert(gateLockout)
      .values({ ip, failedAttempts: 1, lockedUntil: null })
      .onConflictDoUpdate({
        target: gateLockout.ip,
        set: {
          failedAttempts: sql`"GateLockout"."failedAttempts" + 1`,
          lastFailedAt: sql`now()`,
          lockedUntil: sql`CASE WHEN "GateLockout"."failedAttempts" + 1 >= ${maxAttempts} THEN now() + (${banMs} || ' milliseconds')::interval ELSE NULL END`,
        },
      })
      .returning();
    const row = rows[0];
    if (!row) {
      return {
        locked: false,
        lockedUntil: null,
        attemptsLeft: GATE_MAX_ATTEMPTS - 1,
      };
    }
    const lockedUntil = row.lockedUntil ? row.lockedUntil.getTime() : null;
    const locked = Boolean(lockedUntil && lockedUntil > Date.now());
    return {
      locked,
      lockedUntil: locked ? lockedUntil : null,
      attemptsLeft: locked
        ? 0
        : Math.max(0, GATE_MAX_ATTEMPTS - row.failedAttempts),
    };
  } catch (error) {
    console.error("recordFailedAttempt error:", error);
    return {
      locked: false,
      lockedUntil: null,
      attemptsLeft: GATE_MAX_ATTEMPTS,
    };
  }
}

export async function clearAttempts(ip: string): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.delete(gateLockout).where(eq(gateLockout.ip, ip));
  } catch {
    /* ignore */
  }
}

/**
 * Singleton "currently active session". Only one device may be logged in at
 * a time. New logins rotate this sid; old tokens with stale sid get rejected.
 */
export async function rotateActiveSession(
  sid: string,
  clientId: string,
  ip: string
): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db
      .insert(gateSession)
      .values({ id: "singleton", sid, device: clientId, ip })
      .onConflictDoUpdate({
        target: gateSession.id,
        set: {
          sid,
          device: clientId,
          ip,
          updatedAt: sql`now()`,
        },
      });
  } catch (error) {
    console.error("rotateActiveSession error:", error);
  }
}

export async function getActiveSessionId(): Promise<string | null> {
  if (!process.env.POSTGRES_URL) {
    return null;
  }
  try {
    const rows = await db
      .select({ sid: gateSession.sid })
      .from(gateSession)
      .where(eq(gateSession.id, "singleton"))
      .limit(1);
    return rows[0]?.sid ?? null;
  } catch {
    return null;
  }
}

export async function clearActiveSession(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.delete(gateSession).where(eq(gateSession.id, "singleton"));
  } catch {
    /* ignore */
  }
}
