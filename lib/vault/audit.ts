import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { desc, eq } from "drizzle-orm";
import type { VaultAuditAction } from "@/lib/db/schema";
import { vaultAuditLog } from "@/lib/db/schema";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export async function logVaultAction({
  userId,
  fileId,
  action,
  detail,
  ip,
}: {
  userId: string;
  fileId?: string;
  action: VaultAuditAction;
  detail?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.insert(vaultAuditLog).values({
      userId,
      fileId: fileId ?? null,
      action,
      detail: detail ?? null,
      ip: ip ?? null,
    });
  } catch (error) {
    console.error("Vault audit log failed:", error);
  }
}

export type VaultAuditRow = {
  id: string;
  action: string;
  fileId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
};

export async function listRecentVaultAudit({
  userId,
  limit = 15,
}: {
  userId: string;
  limit?: number;
}): Promise<VaultAuditRow[]> {
  if (!process.env.POSTGRES_URL) {
    return [];
  }
  try {
    const rows = await db
      .select({
        id: vaultAuditLog.id,
        action: vaultAuditLog.action,
        fileId: vaultAuditLog.fileId,
        detail: vaultAuditLog.detail,
        createdAt: vaultAuditLog.createdAt,
      })
      .from(vaultAuditLog)
      .where(eq(vaultAuditLog.userId, userId))
      .orderBy(desc(vaultAuditLog.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      fileId: row.fileId,
      detail: row.detail as Record<string, unknown> | null,
      createdAt: row.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}
