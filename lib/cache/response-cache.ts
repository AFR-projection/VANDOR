import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { responseCache } from "@/lib/db/schema";

const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

function buildKey(userId: string, modelId: string, query: string): string {
  return createHash("sha256")
    .update(`${userId}:${modelId}:${query.trim().toLowerCase()}`)
    .digest("hex");
}

export async function getCachedResponse({
  userId,
  modelId,
  query,
}: {
  userId: string;
  modelId: string;
  query: string;
}): Promise<string | null> {
  if (!process.env.POSTGRES_URL || process.env.VANDOR_DISABLE_RESPONSE_CACHE === "1") {
    return null;
  }

  const cacheKey = buildKey(userId, modelId, query);
  const rows = await db
    .select()
    .from(responseCache)
    .where(eq(responseCache.cacheKey, cacheKey))
    .limit(1);

  const row = rows.at(0);
  if (!row) {
    return null;
  }

  if (Date.now() - row.fetchedAt.getTime() > CACHE_TTL_MS) {
    return null;
  }

  return row.response;
}

export async function setCachedResponse({
  userId,
  modelId,
  query,
  response,
}: {
  userId: string;
  modelId: string;
  query: string;
  response: string;
}): Promise<void> {
  if (!process.env.POSTGRES_URL || process.env.VANDOR_DISABLE_RESPONSE_CACHE === "1") {
    return;
  }

  if (response.length < 20) {
    return;
  }

  const cacheKey = buildKey(userId, modelId, query);
  await db
    .insert(responseCache)
    .values({ cacheKey, response, modelId })
    .onConflictDoUpdate({
      target: responseCache.cacheKey,
      set: { response, modelId, fetchedAt: new Date() },
    });
}
