import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getOpenRouterContextForUser } from "@/lib/ai/integration-models";
import type { MemoryCategory } from "@/lib/db/schema";
import { userMemory } from "@/lib/db/schema";
import { getEmbeddingOptionsForUser } from "./embedding-options";
import { embeddingToSql, embedText } from "./embeddings";
import { mergeMemoryTexts } from "./merge";
import {
  type MemoryMetadata,
  parseMemoryMetadata,
  withAccessBump,
} from "./metadata";
import { rerankDocuments } from "./rerank";

/** At or above: update existing row instead of inserting duplicate. */
export const MEMORY_MERGE_SIMILARITY = 0.82;
/** At or above with identical text: return existing id only. */
export const MEMORY_DUPLICATE_SIMILARITY = 0.92;

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export type MemoryRecord = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  similarity?: number;
  metadata?: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
};

function isVisualMemory(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  return (metadata as { visual?: boolean }).visual === true;
}

export async function searchMemories({
  userId,
  query,
  limit = 8,
  minSimilarity = 0.72,
  includeVisual = true,
  enabledCategories,
}: {
  userId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
  includeVisual?: boolean;
  enabledCategories?: Record<MemoryCategory, boolean>;
}): Promise<MemoryRecord[]> {
  if (!query.trim() || !process.env.POSTGRES_URL) {
    return [];
  }

  try {
    const embedOpts = await getEmbeddingOptionsForUser(userId);
    const vector = await embedText(query, {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    });
    const vectorSql = embeddingToSql(vector);

    const fetchLimit = Math.min(limit * 3, 36);

    const rows = await client<
      {
        id: string;
        content: string;
        category: MemoryCategory;
        importance: number;
        similarity: number;
        metadata: unknown;
        updatedAt: Date;
      }[]
    >`
      SELECT
        id,
        content,
        category,
        importance,
        metadata,
        "updatedAt",
        1 - (embedding <=> ${vectorSql}::vector) AS similarity
      FROM "UserMemory"
      WHERE "userId" = ${userId}::uuid
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorSql}::vector
      LIMIT ${fetchLimit}
    `;

    const filtered = rows
      .filter((r) => {
        if (r.similarity < minSimilarity) {
          return false;
        }
        if (enabledCategories && !enabledCategories[r.category]) {
          return false;
        }
        if (!includeVisual && isVisualMemory(r.metadata)) {
          return false;
        }
        return true;
      })
      .map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category,
        importance: r.importance,
        similarity: r.similarity,
        metadata: r.metadata as Record<string, unknown> | null,
        updatedAt: r.updatedAt,
      }));

    const ctx = await getOpenRouterContextForUser(userId);
    const rerankModel = ctx.models.rerankModel;
    const reranked = await rerankDocuments({
      ctx,
      model: rerankModel,
      query,
      documents: filtered,
    });

    return reranked.slice(0, limit);
  } catch (error) {
    console.error("Memory search failed:", error);
    return [];
  }
}

async function findSimilarForSave(
  userId: string,
  content: string
): Promise<MemoryRecord | null> {
  const hits = await searchMemories({
    userId,
    query: content,
    limit: 1,
    minSimilarity: MEMORY_MERGE_SIMILARITY,
  });
  return hits[0] ?? null;
}

export async function touchMemories({
  userId,
  memoryIds,
}: {
  userId: string;
  memoryIds: string[];
}): Promise<void> {
  const unique = [...new Set(memoryIds)].filter(Boolean);
  if (unique.length === 0 || !process.env.POSTGRES_URL) {
    return;
  }

  try {
    for (const memoryId of unique.slice(0, 20)) {
      const row = await getMemoryById({ userId, memoryId });
      if (!row) continue;
      const meta = withAccessBump(parseMemoryMetadata(row.metadata));
      await client`
        UPDATE "UserMemory"
        SET
          metadata = ${JSON.stringify(meta)}::jsonb,
          "updatedAt" = now()
        WHERE id = ${memoryId}::uuid AND "userId" = ${userId}::uuid
      `;
    }
  } catch (error) {
    console.error("Touch memories failed:", error);
  }
}

export async function saveMemory({
  userId,
  content,
  category = "fact",
  importance = 5,
  sourceChatId,
  metadata,
  mergeSimilar = true,
}: {
  userId: string;
  content: string;
  category?: MemoryCategory;
  importance?: number;
  sourceChatId?: string;
  metadata?: MemoryMetadata;
  mergeSimilar?: boolean;
}): Promise<string | null> {
  if (!content.trim() || !process.env.POSTGRES_URL) {
    return null;
  }

  const trimmed = content.trim();

  try {
    if (mergeSimilar) {
      const existing = await findSimilarForSave(userId, trimmed);
      if (existing?.id) {
        const sim = existing.similarity ?? 0;
        if (
          sim >= MEMORY_DUPLICATE_SIMILARITY &&
          existing.content.trim().toLowerCase() === trimmed.toLowerCase()
        ) {
          return existing.id;
        }
        if (sim >= MEMORY_MERGE_SIMILARITY) {
          const merged = mergeMemoryTexts(existing.content, trimmed);
          const prevMeta = parseMemoryMetadata(existing.metadata);
          const ok = await updateMemory({
            userId,
            memoryId: existing.id,
            content: merged,
            category,
            importance: Math.max(existing.importance, importance),
          });
          if (ok) {
            await client`
              UPDATE "UserMemory"
              SET metadata = ${JSON.stringify({
                ...prevMeta,
                ...metadata,
                mergedFrom: [
                  ...(prevMeta.mergedFrom ?? []),
                  trimmed.slice(0, 120),
                ].slice(-5),
              })}::jsonb
              WHERE id = ${existing.id}::uuid AND "userId" = ${userId}::uuid
            `;
          }
          return existing.id;
        }
      }
    }

    const embedOpts = await getEmbeddingOptionsForUser(userId);
    const vector = await embedText(trimmed, {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    });
    const vectorSql = embeddingToSql(vector);

    const [row] = await client<{ id: string }[]>`
      INSERT INTO "UserMemory" (
        "userId",
        "content",
        "embedding",
        "category",
        "importance",
        "sourceChatId",
        "metadata"
      )
      VALUES (
        ${userId}::uuid,
        ${trimmed},
        ${vectorSql}::vector,
        ${category},
        ${importance},
        ${sourceChatId ?? null},
        ${metadata ? JSON.stringify(metadata) : null}
      )
      RETURNING id
    `;

    return row?.id ?? null;
  } catch (error) {
    console.error("Save memory failed:", error);
    return null;
  }
}

export async function getMemoryById({
  userId,
  memoryId,
}: {
  userId: string;
  memoryId: string;
}): Promise<MemoryRecord | null> {
  try {
    const rows = await db
      .select({
        id: userMemory.id,
        content: userMemory.content,
        category: userMemory.category,
        importance: userMemory.importance,
        metadata: userMemory.metadata,
      })
      .from(userMemory)
      .where(and(eq(userMemory.id, memoryId), eq(userMemory.userId, userId)))
      .limit(1);

    const row = rows.at(0);
    if (!row) return null;
    return {
      id: row.id,
      content: row.content,
      category: row.category as MemoryCategory,
      importance: row.importance,
      metadata: row.metadata as Record<string, unknown> | null,
    };
  } catch {
    return null;
  }
}

export async function searchAllUserData({
  userId,
  query,
  limit = 8,
}: {
  userId: string;
  query: string;
  limit?: number;
}): Promise<{
  memories: MemoryRecord[];
  tasks: Array<{ id: string; title: string; status: string }>;
}> {
  // ISOLATION: Vault files are intentionally EXCLUDED from this search.
  // Vault must never be reachable by AI tools — only via direct backend
  // commands in Vault Mode or explicit `/share-to-ai <id>`.
  const [memories, tasks] = await Promise.all([
    searchMemories({ userId, query, limit, minSimilarity: 0.55 }),
    import("./assistant-db").then((m) => m.listTasks(userId, limit)),
  ]);

  const q = query.toLowerCase();
  const filteredTasks = tasks.filter((t) => t.title.toLowerCase().includes(q));

  return {
    memories,
    tasks: filteredTasks.slice(0, limit),
  };
}

export async function listRecentMemories({
  userId,
  limit = 12,
  includeVisual = true,
  enabledCategories,
}: {
  userId: string;
  limit?: number;
  includeVisual?: boolean;
  enabledCategories?: Record<MemoryCategory, boolean>;
}): Promise<MemoryRecord[]> {
  try {
    const rows = await db
      .select({
        id: userMemory.id,
        content: userMemory.content,
        category: userMemory.category,
        importance: userMemory.importance,
        metadata: userMemory.metadata,
        createdAt: userMemory.createdAt,
        updatedAt: userMemory.updatedAt,
      })
      .from(userMemory)
      .where(eq(userMemory.userId, userId))
      .orderBy(sql`${userMemory.importance} DESC, ${userMemory.updatedAt} DESC`)
      .limit(limit * 3);

    return rows
      .filter((r) => {
        const cat = r.category as MemoryCategory;
        if (enabledCategories && !enabledCategories[cat]) {
          return false;
        }
        if (!includeVisual && isVisualMemory(r.metadata)) {
          return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category as MemoryCategory,
        importance: r.importance,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  } catch {
    return [];
  }
}

export async function listMemoriesSavedSince({
  userId,
  since,
  limit = 5,
}: {
  userId: string;
  since: Date;
  limit?: number;
}): Promise<MemoryRecord[]> {
  if (!process.env.POSTGRES_URL) {
    return [];
  }
  try {
    const rows = await db
      .select({
        id: userMemory.id,
        content: userMemory.content,
        category: userMemory.category,
        importance: userMemory.importance,
        metadata: userMemory.metadata,
        createdAt: userMemory.createdAt,
        updatedAt: userMemory.updatedAt,
      })
      .from(userMemory)
      .where(
        and(
          eq(userMemory.userId, userId),
          sql`${userMemory.updatedAt} >= ${since.toISOString()}::timestamptz`
        )
      )
      .orderBy(sql`${userMemory.updatedAt} DESC`)
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category as MemoryCategory,
      importance: r.importance,
      metadata: r.metadata as Record<string, unknown> | null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  } catch {
    return [];
  }
}

export async function getMemoryStatsForUser(userId: string): Promise<{
  total: number;
  text: number;
  visual: number;
  byCategory: Record<MemoryCategory, number>;
}> {
  const empty: Record<MemoryCategory, number> = {
    fact: 0,
    preference: 0,
    goal: 0,
    person: 0,
    event: 0,
    instruction: 0,
  };

  if (!process.env.POSTGRES_URL) {
    return { total: 0, text: 0, visual: 0, byCategory: empty };
  }

  try {
    const rows = await db
      .select({
        category: userMemory.category,
        metadata: userMemory.metadata,
      })
      .from(userMemory)
      .where(eq(userMemory.userId, userId));

    let visual = 0;
    const byCategory = { ...empty };
    for (const row of rows) {
      const cat = row.category as MemoryCategory;
      if (byCategory[cat] != null) {
        byCategory[cat] += 1;
      }
      if (isVisualMemory(row.metadata)) {
        visual += 1;
      }
    }
    const total = rows.length;
    return { total, text: total - visual, visual, byCategory };
  } catch {
    return { total: 0, text: 0, visual: 0, byCategory: empty };
  }
}

export async function listAllMemories({
  userId,
  limit = 100,
  offset = 0,
  category,
  visualOnly,
}: {
  userId: string;
  limit?: number;
  offset?: number;
  category?: MemoryCategory;
  visualOnly?: boolean;
}): Promise<MemoryRecord[]> {
  try {
    const rows = await db
      .select({
        id: userMemory.id,
        content: userMemory.content,
        category: userMemory.category,
        importance: userMemory.importance,
        metadata: userMemory.metadata,
        createdAt: userMemory.createdAt,
        updatedAt: userMemory.updatedAt,
      })
      .from(userMemory)
      .where(eq(userMemory.userId, userId))
      .orderBy(sql`${userMemory.updatedAt} DESC`)
      .limit(limit + offset);

    return rows
      .filter((r) => {
        if (category && r.category !== category) {
          return false;
        }
        const visual = isVisualMemory(r.metadata);
        if (visualOnly === true && !visual) {
          return false;
        }
        if (visualOnly === false && visual) {
          return false;
        }
        return true;
      })
      .slice(offset, offset + limit)
      .map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category as MemoryCategory,
        importance: r.importance,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
  } catch {
    return [];
  }
}

export async function updateMemory({
  userId,
  memoryId,
  content,
  category,
  importance,
}: {
  userId: string;
  memoryId: string;
  content?: string;
  category?: MemoryCategory;
  importance?: number;
}): Promise<boolean> {
  try {
    const existing = await getMemoryById({ userId, memoryId });
    if (!existing) {
      return false;
    }

    const nextContent = content?.trim() ?? existing.content;
    const embedOpts = await getEmbeddingOptionsForUser(userId);
    const vector = await embedText(nextContent, {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    });
    const vectorSql = embeddingToSql(vector);

    await client`
      UPDATE "UserMemory"
      SET
        content = ${nextContent},
        category = ${category ?? existing.category},
        importance = ${importance ?? existing.importance},
        embedding = ${vectorSql}::vector,
        "updatedAt" = now()
      WHERE id = ${memoryId}::uuid AND "userId" = ${userId}::uuid
    `;
    return true;
  } catch (error) {
    console.error("Update memory failed:", error);
    return false;
  }
}

export async function deleteMemory({
  userId,
  memoryId,
}: {
  userId: string;
  memoryId: string;
}): Promise<boolean> {
  try {
    const deleted = await db
      .delete(userMemory)
      .where(and(eq(userMemory.id, memoryId), eq(userMemory.userId, userId)))
      .returning({ id: userMemory.id });
    return deleted.length > 0;
  } catch {
    return false;
  }
}

export async function deleteAllMemories({
  userId,
  visualOnly,
}: {
  userId: string;
  visualOnly?: boolean;
}): Promise<number> {
  try {
    if (!visualOnly) {
      const deleted = await db
        .delete(userMemory)
        .where(eq(userMemory.userId, userId))
        .returning({ id: userMemory.id });
      return deleted.length;
    }

    const rows = await listAllMemories({
      userId,
      limit: 500,
      visualOnly: true,
    });
    let count = 0;
    for (const row of rows) {
      const ok = await deleteMemory({ userId, memoryId: row.id });
      if (ok) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export async function countVisualMemories(userId: string): Promise<number> {
  const rows = await listAllMemories({
    userId,
    limit: 500,
    visualOnly: true,
  });
  return rows.length;
}
