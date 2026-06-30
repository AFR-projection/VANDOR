import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { whatsappSessionState } from "@/lib/db/schema";
import type { WhatsappState, WhatsappStatus } from "@/lib/whatsapp/manager";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

const VALID_STATUS = new Set<WhatsappStatus>([
  "idle",
  "connecting",
  "qr",
  "connected",
  "logged_out",
  "error",
]);

function parseStatus(raw: string): WhatsappStatus {
  if (VALID_STATUS.has(raw as WhatsappStatus)) {
    return raw as WhatsappStatus;
  }
  return "idle";
}

export async function loadWhatsappState(
  userId: string
): Promise<WhatsappState | null> {
  const rows = await db
    .select()
    .from(whatsappSessionState)
    .where(eq(whatsappSessionState.userId, userId))
    .limit(1);
  const row = rows.at(0);
  if (!row) {
    return null;
  }
  return {
    status: parseStatus(row.status),
    qr: row.qrDataUrl ?? null,
    me: row.me ?? null,
    error: row.error ?? null,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function saveWhatsappState(
  userId: string,
  state: WhatsappState
): Promise<void> {
  await db
    .insert(whatsappSessionState)
    .values({
      userId,
      status: state.status,
      qrDataUrl: state.qr ?? null,
      me: state.me ?? null,
      error: state.error ?? null,
      updatedAt: new Date(state.updatedAt),
    })
    .onConflictDoUpdate({
      target: whatsappSessionState.userId,
      set: {
        status: state.status,
        qrDataUrl: state.qr ?? null,
        me: state.me ?? null,
        error: state.error ?? null,
        updatedAt: new Date(state.updatedAt),
      },
    });
}

export async function clearWhatsappState(userId: string): Promise<void> {
  await db
    .delete(whatsappSessionState)
    .where(eq(whatsappSessionState.userId, userId));
}

export function mergeWhatsappStates(
  memory: WhatsappState,
  persisted: WhatsappState | null
): WhatsappState {
  if (!persisted) {
    return memory;
  }
  if (memory.updatedAt >= persisted.updatedAt) {
    return memory;
  }
  return persisted;
}
