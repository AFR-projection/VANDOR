import { desc, eq, isNotNull } from "drizzle-orm";
import { userSecrets } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/security/crypto-core";
import { autonomousConfig } from "./config";
import { db } from "./db";
import { resolveOwnerUserId } from "./owner";

const CACHE_MS = 60_000;

let cached: { at: number; key: string | null } | null = null;

/**
 * OpenRouter key untuk worker: Settings (DB owner) → env OPENROUTER_API_KEY.
 * Chat UI menyimpan key di UserSecrets; worker harus baca dari sini juga.
 */
export async function resolveOpenRouterApiKey(): Promise<string | null> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) {
    return cached.key;
  }

  const envKey = autonomousConfig.openrouterApiKey.trim() || null;
  let dbKey: string | null = null;

  const ownerId = await resolveOwnerUserId();
  if (ownerId) {
    dbKey = await readKeyForUser(ownerId);
  }

  if (!dbKey) {
    const anyRow = await db
      .select({ userId: userSecrets.userId, enc: userSecrets.openrouterApiKeyEnc })
      .from(userSecrets)
      .where(isNotNull(userSecrets.openrouterApiKeyEnc))
      .orderBy(desc(userSecrets.updatedAt))
      .limit(1);
    if (anyRow[0]?.enc) {
      dbKey = decryptSecret(anyRow[0].enc);
    }
  }

  const key = dbKey ?? envKey;
  cached = { at: now, key };
  return key;
}

async function readKeyForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({ enc: userSecrets.openrouterApiKeyEnc })
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .limit(1);
  const enc = rows[0]?.enc;
  if (!enc) {
    return null;
  }
  return decryptSecret(enc);
}

/** Diagnostik tanpa mengekspos key. */
export async function describeOpenRouterKeyStatus(): Promise<{
  configured: boolean;
  source: "database" | "env" | "none";
}> {
  const key = await resolveOpenRouterApiKey();
  if (!key) {
    return { configured: false, source: "none" };
  }
  const envKey = autonomousConfig.openrouterApiKey.trim();
  if (envKey && key === envKey) {
    return { configured: true, source: "env" };
  }
  return { configured: true, source: "database" };
}

/** Paksa refresh cache (mis. setelah owner ganti key di Settings). */
export function invalidateOpenRouterKeyCache(): void {
  cached = null;
}
