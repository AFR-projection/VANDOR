import { asc, desc, eq, isNotNull } from "drizzle-orm";
import { user, userSecrets } from "@/lib/db/schema";
import { autonomousConfig } from "./config";
import { db } from "./db";

let cachedOwnerId: string | null = null;

/**
 * Resolusi user owner untuk menautkan goal/aksi. Pakai VANDOR_OWNER_EMAIL,
 * fallback ke user pertama yang dibuat. Hasil di-cache di memori proses.
 */
export async function resolveOwnerUserId(): Promise<string | null> {
  if (cachedOwnerId) {
    return cachedOwnerId;
  }

  if (autonomousConfig.ownerEmail) {
    const byEmail = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, autonomousConfig.ownerEmail))
      .limit(1);
    if (byEmail.length > 0) {
      cachedOwnerId = byEmail[0].id;
      return cachedOwnerId;
    }
  }

  const first = await db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt))
    .limit(1);
  if (first[0]?.id) {
    cachedOwnerId = first[0].id;
    return cachedOwnerId;
  }

  const withOrKey = await db
    .select({ userId: userSecrets.userId })
    .from(userSecrets)
    .where(isNotNull(userSecrets.openrouterApiKeyEnc))
    .orderBy(desc(userSecrets.updatedAt))
    .limit(1);
  cachedOwnerId = withOrKey[0]?.userId ?? null;
  return cachedOwnerId;
}
