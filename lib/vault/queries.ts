import "server-only";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { VaultFileType } from "@/lib/db/schema";
import { vaultFile } from "@/lib/db/schema";
import { getEmbeddingOptionsForUser } from "@/lib/memory/embedding-options";
import { embeddingToSql, embedText } from "@/lib/memory/embeddings";
import { logVaultAction } from "./audit";
import { toVaultSnapshot } from "./snapshot";
import type { VaultFileSnapshot, VaultSearchResult } from "./types";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

const MAX_INDEX_TEXT = 4000;

function indexableText(input: {
  fileName: string;
  summary?: string | null;
  tags?: string[] | null;
  extractedText?: string | null;
}): string {
  const tags = Array.isArray(input.tags) ? input.tags.join(", ") : "";
  const extracted = input.extractedText?.slice(0, MAX_INDEX_TEXT) ?? "";
  return [input.fileName, input.summary, tags, extracted].filter(Boolean).join("\n");
}

export async function resolveVaultFileTarget({
  userId,
  target,
}: {
  userId: string;
  target: string;
}) {
  const trimmed = target.trim();
  if (isVaultFileId(trimmed)) {
    return getVaultFileById({ userId, fileId: trimmed });
  }

  const byName = await client<
    { id: string }[]
  >`
    SELECT id FROM "VaultFile"
    WHERE "userId" = ${userId}::uuid
      AND "fileName" ILIKE ${`%${trimmed}%`}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  const id = byName.at(0)?.id;
  if (!id) {
    return null;
  }
  return getVaultFileById({ userId, fileId: id });
}

function isVaultFileId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function getVaultFileById({
  userId,
  fileId,
}: {
  userId: string;
  fileId: string;
}) {
  try {
    const rows = await db
      .select()
      .from(vaultFile)
      .where(and(eq(vaultFile.id, fileId), eq(vaultFile.userId, userId)))
      .limit(1);
    return rows.at(0) ?? null;
  } catch {
    return null;
  }
}

export async function listVaultFiles({
  userId,
  limit = 30,
  offset = 0,
  fileType,
  tag,
  search,
}: {
  userId: string;
  limit?: number;
  offset?: number;
  fileType?: VaultFileType;
  tag?: string;
  search?: string;
}): Promise<VaultFileSnapshot[]> {
  try {
    const conditions = [eq(vaultFile.userId, userId)];
    if (fileType) {
      conditions.push(eq(vaultFile.fileType, fileType));
    }
    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(vaultFile.fileName, q),
          ilike(vaultFile.summary, q),
          sql`${vaultFile.tags}::text ILIKE ${q}`
        )!
      );
    }
    if (tag?.trim()) {
      conditions.push(
        sql`${vaultFile.tags}::text ILIKE ${`%${tag.trim()}%`}`
      );
    }

    const rows = await db
      .select({
        id: vaultFile.id,
        fileName: vaultFile.fileName,
        fileType: vaultFile.fileType,
        mimeType: vaultFile.mimeType,
        fileSize: vaultFile.fileSize,
        summary: vaultFile.summary,
        tags: vaultFile.tags,
        sourceType: vaultFile.sourceType,
        createdAt: vaultFile.createdAt,
      })
      .from(vaultFile)
      .where(and(...conditions))
      .orderBy(desc(vaultFile.createdAt))
      .limit(limit)
      .offset(offset);

    return rows.map((row) => toVaultSnapshot(row));
  } catch (error) {
    console.error("listVaultFiles failed:", error);
    throw error;
  }
}

export async function searchVaultFiles({
  userId,
  query,
  limit = 10,
  minSimilarity = 0.42,
  fileType,
  ip,
}: {
  userId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
  fileType?: VaultFileType;
  ip?: string;
}): Promise<VaultSearchResult> {
  if (!query.trim() || !process.env.POSTGRES_URL) {
    return { files: [], total: 0 };
  }

  await logVaultAction({
    userId,
    action: "search",
    detail: { query: query.slice(0, 200), fileType },
    ip,
  });

  try {
    const embedOpts = await getEmbeddingOptionsForUser(userId);
    const vector = await embedText(query, {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    });
    const vectorSql = embeddingToSql(vector);
    const fetchLimit = Math.min(limit * 3, 30);

    const rows = await client<
      {
        id: string;
        fileName: string;
        fileType: string;
        mimeType: string;
        fileSize: number;
        summary: string | null;
        tags: unknown;
        sourceType: string;
        createdAt: Date;
        similarity: number;
      }[]
    >`
      SELECT
        id,
        "fileName",
        "fileType",
        "mimeType",
        "fileSize",
        summary,
        tags,
        "sourceType",
        "createdAt",
        1 - (embedding <=> ${vectorSql}::vector) AS similarity
      FROM "VaultFile"
      WHERE "userId" = ${userId}::uuid
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${vectorSql}::vector
      LIMIT ${fetchLimit}
    `;

    const files = rows
      .filter((row) => {
        if (row.similarity < minSimilarity) {
          return false;
        }
        if (fileType && row.fileType !== fileType) {
          return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((row) =>
        toVaultSnapshot(
          {
            id: row.id,
            fileName: row.fileName,
            fileType: row.fileType,
            mimeType: row.mimeType,
            fileSize: row.fileSize,
            summary: row.summary,
            tags: row.tags as string[] | null,
            sourceType: row.sourceType,
            createdAt: row.createdAt,
          },
          row.similarity
        )
      );

    if (files.length > 0) {
      return { files, total: files.length };
    }
  } catch (error) {
    console.error("Vault semantic search failed:", error);
  }

  const keywordRows = await db
    .select({
      id: vaultFile.id,
      fileName: vaultFile.fileName,
      fileType: vaultFile.fileType,
      mimeType: vaultFile.mimeType,
      fileSize: vaultFile.fileSize,
      summary: vaultFile.summary,
      tags: vaultFile.tags,
      sourceType: vaultFile.sourceType,
      createdAt: vaultFile.createdAt,
    })
    .from(vaultFile)
    .where(
      and(
        eq(vaultFile.userId, userId),
        or(
          ilike(vaultFile.fileName, `%${query}%`),
          ilike(vaultFile.summary, `%${query}%`),
          sql`${vaultFile.tags}::text ILIKE ${`%${query}%`}`
        )
      )
    )
    .orderBy(desc(vaultFile.createdAt))
    .limit(limit);

  const files = keywordRows
    .filter((row) => !fileType || row.fileType === fileType)
    .map((row) => toVaultSnapshot(row));

  return { files, total: files.length };
}

export async function updateVaultFileMeta({
  userId,
  fileId,
  name,
  summary,
  tags,
}: {
  userId: string;
  fileId: string;
  name?: string;
  summary?: string;
  tags?: string[];
}): Promise<VaultFileSnapshot | null> {
  const existing = await getVaultFileById({ userId, fileId });
  if (!existing) {
    return null;
  }

  const nextName = name?.trim() || existing.fileName;
  const nextSummary = summary?.trim() ?? existing.summary;
  const nextTags = tags ?? (existing.tags as string[] | null) ?? [];

  try {
    const embedOpts = await getEmbeddingOptionsForUser(userId);
    const vector = await embedText(
      indexableText({
        fileName: nextName,
        summary: nextSummary,
        tags: nextTags,
        extractedText: existing.extractedText,
      }),
      {
        apiKey: embedOpts.apiKey ?? undefined,
        model: embedOpts.model,
      }
    );
    const vectorSql = embeddingToSql(vector);

    await client`
      UPDATE "VaultFile"
      SET
        "fileName" = ${nextName},
        summary = ${nextSummary},
        tags = ${JSON.stringify(nextTags)}::json,
        embedding = ${vectorSql}::vector,
        "updatedAt" = now()
      WHERE id = ${fileId}::uuid AND "userId" = ${userId}::uuid
    `;

    const updated = await getVaultFileById({ userId, fileId });
    return updated ? toVaultSnapshot(updated) : null;
  } catch (error) {
    console.error("Update vault file meta failed:", error);
    return null;
  }
}

export async function deleteVaultFile({
  userId,
  fileId,
  ip,
}: {
  userId: string;
  fileId: string;
  ip?: string;
}): Promise<boolean> {
  const existing = await getVaultFileById({ userId, fileId });
  if (!existing) {
    return false;
  }

  const { deleteEncryptedBlob } = await import("./storage");
  try {
    await deleteEncryptedBlob(
      existing.r2Key,
      existing.storageBackend as "r2" | "local"
    );
  } catch (error) {
    console.error("Vault blob delete failed:", error);
  }

  try {
    await db
      .delete(vaultFile)
      .where(and(eq(vaultFile.id, fileId), eq(vaultFile.userId, userId)));

    await logVaultAction({
      userId,
      fileId,
      action: "delete",
      detail: { fileName: existing.fileName },
      ip,
    });
    return true;
  } catch {
    return false;
  }
}

export async function embedVaultFileRecord({
  userId,
  fileId,
  fileName,
  summary,
  tags,
  extractedText,
}: {
  userId: string;
  fileId: string;
  fileName: string;
  summary?: string | null;
  tags?: string[] | null;
  extractedText?: string | null;
}): Promise<void> {
  const embedOpts = await getEmbeddingOptionsForUser(userId);
  const vector = await embedText(
    indexableText({ fileName, summary, tags, extractedText }),
    {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    }
  );
  const vectorSql = embeddingToSql(vector);

  await client`
    UPDATE "VaultFile"
    SET embedding = ${vectorSql}::vector, "updatedAt" = now()
    WHERE id = ${fileId}::uuid AND "userId" = ${userId}::uuid
  `;
}

export async function insertVaultFileRow(
  values: typeof vaultFile.$inferInsert
): Promise<string | null> {
  try {
    const inserted = await db.insert(vaultFile).values(values).returning({
      id: vaultFile.id,
    });
    return inserted.at(0)?.id ?? null;
  } catch (error) {
    console.error("Insert vault file failed:", error);
    return null;
  }
}

export async function countVaultFiles(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vaultFile)
      .where(eq(vaultFile.userId, userId));
    return rows.at(0)?.count ?? 0;
  } catch {
    return 0;
  }
}
