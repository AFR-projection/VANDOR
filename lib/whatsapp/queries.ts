import "server-only";

import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  whatsappOwner,
  whatsappVerifCode,
  whatsappVerifLog,
} from "@/lib/db/schema";
import {
  isLikelyDialablePhone,
  isWhatsappLidDigits,
  normalizeWhatsappNumber,
} from "@/lib/whatsapp/phone";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── Code helpers ────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
    if (i === 3) {
      out += "-";
    }
  }
  return out;
}

export async function createVerifCode(userId: string) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const [row] = await db
    .insert(whatsappVerifCode)
    .values({ userId, code, expiresAt })
    .returning();

  await writeLog({
    userId,
    phone: null,
    event: "code_generated",
    meta: { code, expiresAt: expiresAt.toISOString() },
  });

  return row;
}

export async function getActiveCode(userId: string) {
  const [row] = await db
    .select()
    .from(whatsappVerifCode)
    .where(
      and(
        eq(whatsappVerifCode.userId, userId),
        isNull(whatsappVerifCode.usedAt),
        gt(whatsappVerifCode.expiresAt, new Date())
      )
    )
    .orderBy(desc(whatsappVerifCode.createdAt))
    .limit(1);
  return row ?? null;
}

export type ValidateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "not_found" | "expired" | "used" };

export async function validateAndConsumeCode(
  code: string,
  phone: string
): Promise<ValidateResult> {
  const normalized = code.trim().toUpperCase();
  const [row] = await db
    .select()
    .from(whatsappVerifCode)
    .where(eq(whatsappVerifCode.code, normalized))
    .limit(1);

  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.usedAt) {
    await writeLog({
      userId: row.userId,
      phone,
      event: "code_invalid",
      meta: { reason: "already_used", code: normalized },
    });
    return { ok: false, reason: "used" };
  }
  if (row.expiresAt < new Date()) {
    await writeLog({
      userId: row.userId,
      phone,
      event: "code_expired",
      meta: { code: normalized },
    });
    return { ok: false, reason: "expired" };
  }

  await db
    .update(whatsappVerifCode)
    .set({ usedAt: new Date(), usedByPhone: phone })
    .where(eq(whatsappVerifCode.id, row.id));

  await writeLog({
    userId: row.userId,
    phone,
    event: "code_used",
    meta: { code: normalized },
  });

  return { ok: true, userId: row.userId };
}

// ─── Owner helpers ───────────────────────────────────────────────────────────

export async function addWhatsappOwner(
  userId: string,
  phone: string,
  label?: string
) {
  const normalized = normalizeWhatsappNumber(phone);
  await db
    .insert(whatsappOwner)
    .values({
      userId,
      phone: normalized,
      label: label ?? null,
      verifiedAt: new Date(),
      revokedAt: null,
    })
    .onConflictDoUpdate({
      target: [whatsappOwner.userId, whatsappOwner.phone],
      set: { verifiedAt: new Date(), revokedAt: null, label: label ?? null },
    });

  await writeLog({
    userId,
    phone: normalized,
    event: "owner_added",
    meta: { label: label ?? null },
  });
}

export async function revokeWhatsappOwner(userId: string, phone: string) {
  await db
    .update(whatsappOwner)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(whatsappOwner.userId, userId), eq(whatsappOwner.phone, phone))
    );

  await writeLog({ userId, phone, event: "owner_revoked", meta: null });
}

export async function getActiveOwners(userId: string) {
  return db
    .select()
    .from(whatsappOwner)
    .where(
      and(eq(whatsappOwner.userId, userId), isNull(whatsappOwner.revokedAt))
    )
    .orderBy(desc(whatsappOwner.verifiedAt));
}

/** Owner untuk UI — sembunyikan baris LID (@lid privacy ID, bukan nomor telepon). */
export async function getActiveOwnersForDisplay(userId: string) {
  const rows = await getActiveOwners(userId);
  return rows.filter(
    (r) =>
      r.label !== "whatsapp-lid-only" && !isWhatsappLidDigits(r.phone)
  );
}

/** Cabut baris LID orphan (bukan nomor telepon yang bisa dihubungi). */
export async function cleanupOrphanLidOwners(userId: string): Promise<number> {
  const rows = await getActiveOwners(userId);
  const dialable = rows.filter((r) => isLikelyDialablePhone(r.phone));
  let revoked = 0;
  for (const row of rows) {
    const isLidRow =
      row.label === "whatsapp-lid-only" || isWhatsappLidDigits(row.phone);
    if (isLidRow && dialable.length > 0) {
      await revokeWhatsappOwner(userId, row.phone);
      revoked += 1;
    }
  }
  return revoked;
}

/** Returns all identifiers for matching incoming messages (phone + linked LID). */
export async function getActiveOwnerPhones(userId: string): Promise<string[]> {
  const rows = await getActiveOwners(userId);
  const keys = new Set<string>();
  for (const r of rows) {
    if (r.label !== "whatsapp-lid-only" && isLikelyDialablePhone(r.phone)) {
      keys.add(r.phone);
    }
    const lidMatch = r.label?.match(/^lid:(\d+)$/);
    if (lidMatch?.[1]) {
      keys.add(lidMatch[1]);
    }
    if (r.label === "whatsapp-lid-only") {
      keys.add(r.phone);
    }
  }
  return [...keys];
}

// ─── Log helpers ─────────────────────────────────────────────────────────────

async function writeLog({
  userId,
  phone,
  event,
  meta,
}: {
  userId: string | null;
  phone: string | null;
  event: (typeof whatsappVerifLog.$inferInsert)["event"];
  meta: Record<string, unknown> | null;
}) {
  await db.insert(whatsappVerifLog).values({
    userId: userId ?? undefined,
    phone: phone ?? undefined,
    event,
    meta: meta ?? undefined,
    createdAt: new Date(),
  });
}

export async function getVerifLogs(userId: string, limit = 30) {
  return db
    .select()
    .from(whatsappVerifLog)
    .where(eq(whatsappVerifLog.userId, userId))
    .orderBy(desc(whatsappVerifLog.createdAt))
    .limit(limit);
}
