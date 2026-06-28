import { and, desc, eq, lt } from "drizzle-orm";
import {
  type AgentRiskLevel,
  agentApproval,
} from "@/lib/db/schema";
import { db } from "./db";

export type CreateApprovalInput = {
  taskId?: string | null;
  actionType: string;
  summary: string;
  payload?: unknown;
  riskLevel?: AgentRiskLevel;
  expiresInMinutes?: number;
};

/** 8 karakter pendek dari UUID — dipakai perintah approve via WhatsApp. */
export function approvalShortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toLowerCase();
}

/** Cari approval pending dari kode pendek (prefix UUID). */
export async function findPendingApprovalByShortId(shortId: string) {
  const normalized = shortId.toLowerCase().replace(/[^a-f0-9]/g, "");
  if (normalized.length < 4) {
    return null;
  }
  const pending = await listPendingApprovals(50);
  const matches = pending.filter((row) =>
    approvalShortId(row.id).startsWith(normalized)
  );
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    return matches.find((row) => approvalShortId(row.id) === normalized) ?? null;
  }
  return null;
}

/** Buat permintaan approval baru (status pending). Hindari duplikat aktif. */
export async function createApproval(
  input: CreateApprovalInput
): Promise<{ id: string; deduped: boolean }> {
  // Dedup: jangan buat approval pending kembar untuk actionType+summary sama.
  const existing = await db
    .select({ id: agentApproval.id })
    .from(agentApproval)
    .where(
      and(
        eq(agentApproval.status, "pending"),
        eq(agentApproval.actionType, input.actionType),
        eq(agentApproval.summary, input.summary)
      )
    )
    .limit(1);
  if (existing.length > 0) {
    return { id: existing[0].id, deduped: true };
  }

  const expiresAt = input.expiresInMinutes
    ? new Date(Date.now() + input.expiresInMinutes * 60_000)
    : new Date(Date.now() + 24 * 60 * 60_000);

  const inserted = await db
    .insert(agentApproval)
    .values({
      taskId: input.taskId ?? null,
      actionType: input.actionType,
      summary: input.summary.slice(0, 2000),
      payload: input.payload ?? null,
      riskLevel: input.riskLevel ?? "dangerous",
      status: "pending",
      expiresAt,
    })
    .returning({ id: agentApproval.id });

  return { id: inserted[0].id, deduped: false };
}

export function listPendingApprovals(limit = 50) {
  return db
    .select()
    .from(agentApproval)
    .where(eq(agentApproval.status, "pending"))
    .orderBy(desc(agentApproval.createdAt))
    .limit(limit);
}

export function getApproval(id: string) {
  return db
    .select()
    .from(agentApproval)
    .where(eq(agentApproval.id, id))
    .limit(1)
    .then((r) => r[0] ?? null);
}

export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  decidedBy: string
): Promise<boolean> {
  const res = await db
    .update(agentApproval)
    .set({ status: decision, decidedBy, decidedAt: new Date() })
    .where(
      and(eq(agentApproval.id, id), eq(agentApproval.status, "pending"))
    )
    .returning({ id: agentApproval.id });
  return res.length > 0;
}

/** Tandai approval kedaluwarsa. Dipanggil tiap tick. */
export async function expireOldApprovals(): Promise<number> {
  const res = await db
    .update(agentApproval)
    .set({ status: "expired" })
    .where(
      and(
        eq(agentApproval.status, "pending"),
        lt(agentApproval.expiresAt, new Date())
      )
    )
    .returning({ id: agentApproval.id });
  return res.length;
}

/** Ambil approval yang baru disetujui & belum dieksekusi (untuk loop). */
export function listApprovedPendingExecution(limit = 10) {
  return db
    .select()
    .from(agentApproval)
    .where(eq(agentApproval.status, "approved"))
    .orderBy(desc(agentApproval.decidedAt))
    .limit(limit);
}

/** Tandai approval sudah dieksekusi agar tidak diproses ulang. */
export async function markApprovalConsumed(id: string): Promise<void> {
  await db
    .update(agentApproval)
    .set({ status: "executed" })
    .where(eq(agentApproval.id, id));
}
