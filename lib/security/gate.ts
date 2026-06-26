import "server-only";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  gateLockout,
  gateSession,
  loginHistory,
  numpadSession,
} from "@/lib/db/schema";
import { GATE_BAN_MS, GATE_MAX_ATTEMPTS } from "./gate-edge";

export * from "./gate-edge";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

const ACTIVE_SESSION_ROW_ID = "singleton";

export type LockoutStatus = {
  locked: boolean;
  lockedUntil: number | null;
  attemptsLeft: number;
};

export type LoginHistoryRow = {
  id: string;
  sid: string | null;
  ip: string;
  userAgent: string | null;
  locationLabel: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  loggedInAt: Date;
  active: boolean;
};

export async function getLockoutStatus(
  clientId: string
): Promise<LockoutStatus> {
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
      .where(eq(gateLockout.ip, clientId))
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

export async function recordFailedAttempt(
  clientId: string
): Promise<LockoutStatus> {
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
      .values({ ip: clientId, failedAttempts: 1, lockedUntil: null })
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

export async function clearAttempts(clientId: string): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.delete(gateLockout).where(eq(gateLockout.ip, clientId));
  } catch {
    /* ignore */
  }
}

/** Satu sesi aktif global (baris singleton — sumber kebenaran untuk isSessionActive). */
export async function setActiveGateSession(input: {
  sid: string;
  deviceId: string;
  ip: string;
}): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db
      .insert(gateSession)
      .values({
        id: ACTIVE_SESSION_ROW_ID,
        sid: input.sid,
        device: input.deviceId,
        ip: input.ip,
      })
      .onConflictDoUpdate({
        target: gateSession.id,
        set: {
          sid: input.sid,
          device: input.deviceId,
          ip: input.ip,
          updatedAt: sql`now()`,
        },
      });
  } catch (error) {
    console.error("setActiveGateSession error:", error);
  }
}

export async function getActiveGateSessionId(): Promise<string | null> {
  if (!process.env.POSTGRES_URL) {
    return null;
  }
  try {
    const rows = await db
      .select({ sid: gateSession.sid })
      .from(gateSession)
      .where(eq(gateSession.id, ACTIVE_SESSION_ROW_ID))
      .limit(1);
    return rows[0]?.sid ?? null;
  } catch {
    return null;
  }
}

/** Cabut sesi lama di NumpadSession (riwayat / perangkat lain). */
export async function revokeAllSessionsExcept(
  activeSid: string
): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db
      .update(numpadSession)
      .set({ revokedAt: sql`now()` })
      .where(
        and(isNull(numpadSession.revokedAt), ne(numpadSession.sid, activeSid))
      );
  } catch (error) {
    console.error("revokeAllSessionsExcept error:", error);
  }
}

export async function registerSession(input: {
  sid: string;
  deviceId: string;
  ip: string;
  userAgent: string | null;
  locationLabel: string;
}): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await setActiveGateSession({
      sid: input.sid,
      deviceId: input.deviceId,
      ip: input.ip,
    });
    await db
      .insert(numpadSession)
      .values({
        sid: input.sid,
        deviceId: input.deviceId,
        ip: input.ip,
        userAgent: input.userAgent,
        locationLabel: input.locationLabel,
      })
      .onConflictDoUpdate({
        target: numpadSession.sid,
        set: {
          deviceId: input.deviceId,
          ip: input.ip,
          userAgent: input.userAgent,
          locationLabel: input.locationLabel,
          lastSeenAt: sql`now()`,
          revokedAt: null,
        },
      });
    await revokeAllSessionsExcept(input.sid);
  } catch (error) {
    console.error("registerSession error:", error);
  }
}

export async function isSessionActive(sid: string): Promise<boolean> {
  if (!process.env.POSTGRES_URL) {
    return true;
  }
  try {
    const rows = await db
      .select({ revokedAt: numpadSession.revokedAt })
      .from(numpadSession)
      .where(eq(numpadSession.sid, sid))
      .limit(1);
    const row = rows[0];
    if (row) {
      return row.revokedAt === null;
    }

    const activeSid = await getActiveGateSessionId();
    return activeSid === sid;
  } catch {
    return true;
  }
}

/** Cabut semua sesi gate (mis. setelah ganti PIN di pengaturan). */
export async function revokeAllGateSessions(): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    const { invalidateGateSessionCache } = await import("./gate-session-cache");
    invalidateGateSessionCache();
    await db
      .update(numpadSession)
      .set({ revokedAt: sql`now()` })
      .where(isNull(numpadSession.revokedAt));
    await db.delete(gateSession);
  } catch (error) {
    console.error("revokeAllGateSessions error:", error);
  }
}

export async function touchSession(sid: string): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db
      .update(numpadSession)
      .set({ lastSeenAt: sql`now()` })
      .where(eq(numpadSession.sid, sid));
  } catch {
    /* ignore */
  }
}

export async function revokeSession(sid: string): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db
      .update(numpadSession)
      .set({ revokedAt: sql`now()` })
      .where(eq(numpadSession.sid, sid));
  } catch {
    /* ignore */
  }
}

export async function recordLoginHistory(input: {
  sid: string;
  ip: string;
  userAgent: string | null;
  locationLabel: string;
  city: string | null;
  region: string | null;
  country: string | null;
}): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.insert(loginHistory).values({
      sid: input.sid,
      ip: input.ip,
      userAgent: input.userAgent,
      locationLabel: input.locationLabel,
      city: input.city,
      region: input.region,
      country: input.country,
    });
  } catch (error) {
    console.error("recordLoginHistory error:", error);
  }
}

export async function listLoginHistory(limit = 50): Promise<LoginHistoryRow[]> {
  if (!process.env.POSTGRES_URL) {
    return [];
  }
  try {
    const rows = await db
      .select({
        id: loginHistory.id,
        sid: loginHistory.sid,
        ip: loginHistory.ip,
        userAgent: loginHistory.userAgent,
        locationLabel: loginHistory.locationLabel,
        city: loginHistory.city,
        region: loginHistory.region,
        country: loginHistory.country,
        loggedInAt: loginHistory.loggedInAt,
        revokedAt: numpadSession.revokedAt,
      })
      .from(loginHistory)
      .leftJoin(numpadSession, eq(loginHistory.sid, numpadSession.sid))
      .orderBy(desc(loginHistory.loggedInAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      sid: row.sid,
      ip: row.ip,
      userAgent: row.userAgent,
      locationLabel: row.locationLabel,
      city: row.city,
      region: row.region,
      country: row.country,
      loggedInAt: row.loggedInAt,
      active: Boolean(row.sid && row.revokedAt === null),
    }));
  } catch (error) {
    console.error("listLoginHistory error:", error);
    return [];
  }
}
