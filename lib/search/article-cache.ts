import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { webArticleCache } from "@/lib/db/schema";

const client = postgres(process.env.POSTGRES_URL ?? "");
const db = drizzle(client);

export function normalizeArticleUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = "";
    if (parsed.pathname.endsWith("/") && parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

export async function getCachedArticle(url: string) {
  const normalized = normalizeArticleUrl(url);
  const rows = await db
    .select()
    .from(webArticleCache)
    .where(eq(webArticleCache.url, normalized))
    .limit(1);
  return rows.at(0) ?? null;
}

export async function saveArticleToCache({
  url,
  title,
  content,
}: {
  url: string;
  title: string;
  content: string;
}) {
  const normalized = normalizeArticleUrl(url);
  await db
    .insert(webArticleCache)
    .values({
      url: normalized,
      title,
      content,
    })
    .onConflictDoUpdate({
      target: webArticleCache.url,
      set: {
        title,
        content,
        fetchedAt: new Date(),
      },
    });
}
