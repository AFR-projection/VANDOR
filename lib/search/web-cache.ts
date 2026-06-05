import "server-only";

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { webSearchCache } from "@/lib/db/schema";
import type { WebSearchOutput } from "./types";

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

function hashQuery(query: string): string {
  return createHash("sha256").update(query.trim().toLowerCase()).digest("hex");
}

export async function getCachedWebSearch(
  query: string
): Promise<WebSearchOutput | null> {
  if (!process.env.POSTGRES_URL) {
    return null;
  }

  const queryHash = hashQuery(query);
  const rows = await db
    .select()
    .from(webSearchCache)
    .where(eq(webSearchCache.queryHash, queryHash))
    .limit(1);

  const row = rows.at(0);
  if (!row) {
    return null;
  }

  const age = Date.now() - row.fetchedAt.getTime();
  if (age > CACHE_TTL_MS) {
    return null;
  }

  return {
    query: row.query,
    sources: row.results as WebSearchOutput["sources"],
    provider: `${row.provider} (cached)`,
  };
}

export async function setCachedWebSearch(
  result: WebSearchOutput
): Promise<void> {
  if (!process.env.POSTGRES_URL || result.sources.length === 0) {
    return;
  }

  const queryHash = hashQuery(result.query);
  await db
    .insert(webSearchCache)
    .values({
      queryHash,
      query: result.query,
      results: result.sources,
      provider: result.provider.replace(" (cached)", ""),
    })
    .onConflictDoUpdate({
      target: webSearchCache.queryHash,
      set: {
        query: result.query,
        results: result.sources,
        provider: result.provider.replace(" (cached)", ""),
        fetchedAt: new Date(),
      },
    });
}
