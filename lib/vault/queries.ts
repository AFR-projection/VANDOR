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
import type { VaultFileSnapshot, VaultSearchResult, VaultStats } from "./types";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

const notDeleted = sql`${vaultFile.deletedAt} IS NULL`;

const vaultListSelect = {
  id: vaultFile.id,
  fileName: vaultFile.fileName,
  fileType: vaultFile.fileType,
  mimeType: vaultFile.mimeType,
  fileSize: vaultFile.fileSize,
  summary: vaultFile.summary,
  tags: vaultFile.tags,
  sourceType: vaultFile.sourceType,
  pinned: vaultFile.pinned,
  folder: vaultFile.folder,
  createdAt: vaultFile.createdAt,
  updatedAt: vaultFile.updatedAt,
};

const MAX_INDEX_TEXT = 4000;

function indexableText(input: {
  fileName: string;
  summary?: string | null;
  tags?: string[] | null;
  extractedText?: string | null;
}): string {
  const tags = Array.isArray(input.tags) ? input.tags.join(", ") : "";
  const extracted = input.extractedText?.slice(0, MAX_INDEX_TEXT) ?? "";
  return [input.fileName, input.summary, tags, extracted]
    .filter(Boolean)
    .join("\n");
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

  const byName = await client<{ id: string }[]>`
    SELECT id FROM "VaultFile"
    WHERE "userId" = ${userId}::uuid
      AND "deletedAt" IS NULL
      AND (
        "fileName" ILIKE ${`%${trimmed}%`}
        OR summary ILIKE ${`%${trimmed}%`}
        OR tags::text ILIKE ${`%${trimmed}%`}
      )
    ORDER BY pinned DESC, "updatedAt" DESC
    LIMIT 1
  `;
  const id = byName.at(0)?.id;
  if (!id) {
    return null;
  }
  return getVaultFileById({ userId, fileId: id });
}

export async function resolveTrashVaultTarget({
  userId,
  target,
}: {
  userId: string;
  target: string;
}) {
  const trimmed = target.trim();
  if (isVaultFileId(trimmed)) {
    const rows = await db
      .select()
      .from(vaultFile)
      .where(
        and(
          eq(vaultFile.id, trimmed),
          eq(vaultFile.userId, userId),
          sql`${vaultFile.deletedAt} IS NOT NULL`
        )
      )
      .limit(1);
    return rows.at(0) ?? null;
  }

  const byName = await client<{ id: string }[]>`
    SELECT id FROM "VaultFile"
    WHERE "userId" = ${userId}::uuid
      AND "deletedAt" IS NOT NULL
      AND (
        "fileName" ILIKE ${`%${trimmed}%`}
        OR summary ILIKE ${`%${trimmed}%`}
      )
    ORDER BY "deletedAt" DESC
    LIMIT 1
  `;
  const id = byName.at(0)?.id;
  if (!id) {
    return null;
  }
  const rows = await db
    .select()
    .from(vaultFile)
    .where(and(eq(vaultFile.id, id), eq(vaultFile.userId, userId)))
    .limit(1);
  return rows.at(0) ?? null;
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
      .where(
        and(eq(vaultFile.id, fileId), eq(vaultFile.userId, userId), notDeleted)
      )
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
  pinnedOnly,
  folder,
  sortBy = "default",
}: {
  userId: string;
  limit?: number;
  offset?: number;
  fileType?: VaultFileType;
  tag?: string;
  search?: string;
  pinnedOnly?: boolean;
  folder?: string;
  sortBy?: "default" | "recent";
}): Promise<VaultFileSnapshot[]> {
  try {
    const conditions = [eq(vaultFile.userId, userId), notDeleted];
    if (fileType) {
      conditions.push(eq(vaultFile.fileType, fileType));
    }
    if (pinnedOnly) {
      conditions.push(eq(vaultFile.pinned, true));
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
      conditions.push(sql`${vaultFile.tags}::text ILIKE ${`%${tag.trim()}%`}`);
    }
    if (folder?.trim()) {
      conditions.push(eq(vaultFile.folder, folder.trim().slice(0, 64)));
    }

    const order =
      sortBy === "recent"
        ? [desc(vaultFile.updatedAt)]
        : [desc(vaultFile.pinned), desc(vaultFile.updatedAt)];

    const rows = await db
      .select(vaultListSelect)
      .from(vaultFile)
      .where(and(...conditions))
      .orderBy(...order)
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
        pinned: boolean;
        folder: string | null;
        createdAt: Date;
        updatedAt: Date;
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
        pinned,
        folder,
        "createdAt",
        "updatedAt",
        1 - (embedding <=> ${vectorSql}::vector) AS similarity
      FROM "VaultFile"
      WHERE "userId" = ${userId}::uuid
        AND embedding IS NOT NULL
        AND "deletedAt" IS NULL
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
            pinned: row.pinned,
            folder: row.folder,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
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
    .select(vaultListSelect)
    .from(vaultFile)
    .where(
      and(
        eq(vaultFile.userId, userId),
        notDeleted,
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
  pinned,
  folder,
}: {
  userId: string;
  fileId: string;
  name?: string;
  summary?: string;
  tags?: string[];
  pinned?: boolean;
  folder?: string | null;
}): Promise<VaultFileSnapshot | null> {
  const existing = await getVaultFileById({ userId, fileId });
  if (!existing) {
    return null;
  }

  const nextName = name?.trim() || existing.fileName;
  const nextSummary =
    summary === undefined ? existing.summary : summary.trim() || null;
  const nextTags = tags ?? (existing.tags as string[] | null) ?? [];
  const nextPinned = pinned ?? existing.pinned;
  const nextFolder =
    folder === undefined
      ? existing.folder
      : folder?.trim().slice(0, 64) || null;

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
        pinned = ${nextPinned},
        folder = ${nextFolder},
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

  try {
    await client`
      UPDATE "VaultFile"
      SET "deletedAt" = now(), "updatedAt" = now()
      WHERE id = ${fileId}::uuid AND "userId" = ${userId}::uuid
    `;

    await logVaultAction({
      userId,
      fileId,
      action: "delete",
      detail: { fileName: existing.fileName, soft: true },
      ip,
    });
    return true;
  } catch {
    return false;
  }
}

export async function restoreVaultFile({
  userId,
  fileId,
  ip,
}: {
  userId: string;
  fileId: string;
  ip?: string;
}): Promise<VaultFileSnapshot | null> {
  try {
    const rows = await client<{ id: string; fileName: string }[]>`
      UPDATE "VaultFile"
      SET "deletedAt" = NULL, "updatedAt" = now()
      WHERE id = ${fileId}::uuid
        AND "userId" = ${userId}::uuid
        AND "deletedAt" IS NOT NULL
      RETURNING id, "fileName"
    `;
    const row = rows.at(0);
    if (!row) {
      return null;
    }
    await logVaultAction({
      userId,
      fileId,
      action: "restore",
      detail: { fileName: row.fileName },
      ip,
    });
    return getVaultFileById({ userId, fileId }).then((r) =>
      r ? toVaultSnapshot(r) : null
    );
  } catch {
    return null;
  }
}

export async function purgeVaultFile({
  userId,
  fileId,
  ip,
}: {
  userId: string;
  fileId: string;
  ip?: string;
}): Promise<boolean> {
  const rows = await client<
    {
      id: string;
      fileName: string;
      r2Key: string;
      storageBackend: string;
    }[]
  >`
    SELECT id, "fileName", "r2Key", "storageBackend"
    FROM "VaultFile"
    WHERE id = ${fileId}::uuid
      AND "userId" = ${userId}::uuid
      AND "deletedAt" IS NOT NULL
    LIMIT 1
  `;
  const existing = rows.at(0);
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
    console.error("Vault blob purge failed:", error);
  }

  try {
    await db
      .delete(vaultFile)
      .where(and(eq(vaultFile.id, fileId), eq(vaultFile.userId, userId)));

    await logVaultAction({
      userId,
      fileId,
      action: "purge",
      detail: { fileName: existing.fileName },
      ip,
    });
    return true;
  } catch {
    return false;
  }
}

export async function listVaultTrash({
  userId,
  limit = 30,
}: {
  userId: string;
  limit?: number;
}): Promise<VaultFileSnapshot[]> {
  try {
    const rows = await db
      .select(vaultListSelect)
      .from(vaultFile)
      .where(
        and(
          eq(vaultFile.userId, userId),
          sql`${vaultFile.deletedAt} IS NOT NULL`
        )
      )
      .orderBy(desc(vaultFile.deletedAt))
      .limit(limit);
    return rows.map((row) => toVaultSnapshot(row));
  } catch {
    return [];
  }
}

export async function purgeAllVaultTrash(userId: string): Promise<number> {
  const rows = await db
    .select({ id: vaultFile.id })
    .from(vaultFile)
    .where(
      and(eq(vaultFile.userId, userId), sql`${vaultFile.deletedAt} IS NOT NULL`)
    );

  const results = await Promise.all(
    rows.map((row) => purgeVaultFile({ userId, fileId: row.id }))
  );
  return results.filter(Boolean).length;
}

export async function listVaultFolders(userId: string): Promise<string[]> {
  try {
    const rows = await client<{ folder: string }[]>`
      SELECT DISTINCT folder
      FROM "VaultFile"
      WHERE "userId" = ${userId}::uuid
        AND "deletedAt" IS NULL
        AND folder IS NOT NULL
        AND trim(folder) <> ''
      ORDER BY folder ASC
    `;
    return rows.map((r) => r.folder).filter(Boolean);
  } catch {
    return [];
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

export async function toggleVaultPin({
  userId,
  fileId,
  pinned,
}: {
  userId: string;
  fileId: string;
  pinned?: boolean;
}): Promise<VaultFileSnapshot | null> {
  const existing = await getVaultFileById({ userId, fileId });
  if (!existing) {
    return null;
  }
  const nextPinned = pinned ?? !existing.pinned;
  await client`
    UPDATE "VaultFile"
    SET pinned = ${nextPinned}, "updatedAt" = now()
    WHERE id = ${fileId}::uuid AND "userId" = ${userId}::uuid
  `;
  const updated = await getVaultFileById({ userId, fileId });
  return updated ? toVaultSnapshot(updated) : null;
}

export async function getVaultStats(userId: string): Promise<VaultStats> {
  try {
    const rows = await client<
      { totalFiles: number; totalBytes: number; pinnedCount: number }[]
    >`
      SELECT
        count(*)::int AS "totalFiles",
        coalesce(sum("fileSize"), 0)::int AS "totalBytes",
        count(*) FILTER (WHERE pinned = true)::int AS "pinnedCount"
      FROM "VaultFile"
      WHERE "userId" = ${userId}::uuid AND "deletedAt" IS NULL
    `;
    const typeRows = await client<{ fileType: string; count: number }[]>`
      SELECT "fileType", count(*)::int AS count
      FROM "VaultFile"
      WHERE "userId" = ${userId}::uuid AND "deletedAt" IS NULL
      GROUP BY "fileType"
    `;
    const summary = rows.at(0);
    const byType: Record<string, number> = {};
    for (const row of typeRows) {
      byType[row.fileType] = row.count;
    }
    return {
      totalFiles: summary?.totalFiles ?? 0,
      totalBytes: summary?.totalBytes ?? 0,
      pinnedCount: summary?.pinnedCount ?? 0,
      byType,
    };
  } catch {
    return { totalFiles: 0, totalBytes: 0, pinnedCount: 0, byType: {} };
  }
}

export async function countVaultFiles(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vaultFile)
      .where(and(eq(vaultFile.userId, userId), notDeleted));
    return rows.at(0)?.count ?? 0;
  } catch {
    return 0;
  }
}

export async function bulkAddVaultTag({
  userId,
  targets,
  tag,
}: {
  userId: string;
  targets: string[];
  tag: string;
}): Promise<{ updated: VaultFileSnapshot[]; failed: string[] }> {
  const normalizedTag = tag.trim().slice(0, 64);
  if (!normalizedTag) {
    return { updated: [], failed: targets };
  }

  const results = await Promise.all(
    targets.map(async (target) => {
      const row = await resolveVaultFileTarget({ userId, target });
      if (!row) {
        return { ok: false as const, target };
      }
      const existingTags = Array.isArray(row.tags)
        ? (row.tags as string[])
        : [];
      if (existingTags.includes(normalizedTag)) {
        return { ok: true as const, snap: toVaultSnapshot(row) };
      }
      const snap = await updateVaultFileMeta({
        userId,
        fileId: row.id,
        tags: [...existingTags, normalizedTag].slice(0, 20),
      });
      if (!snap) {
        return { ok: false as const, target };
      }
      return { ok: true as const, snap };
    })
  );

  const updated: VaultFileSnapshot[] = [];
  const failed: string[] = [];
  for (const result of results) {
    if (result.ok) {
      updated.push(result.snap);
    } else {
      failed.push(result.target);
    }
  }
  return { updated, failed };
}

export async function bulkDeleteVaultByFilter({
  userId,
  tag,
  fileType,
  ip,
}: {
  userId: string;
  tag?: string;
  fileType?: VaultFileType;
  ip?: string;
}): Promise<{ deleted: number; total: number }> {
  const conditions = [eq(vaultFile.userId, userId), notDeleted];
  if (fileType) {
    conditions.push(eq(vaultFile.fileType, fileType));
  }
  if (tag?.trim()) {
    conditions.push(sql`${vaultFile.tags}::text ILIKE ${`%${tag.trim()}%`}`);
  }

  const rows = await db
    .select({ id: vaultFile.id })
    .from(vaultFile)
    .where(and(...conditions));

  const deleteResults = await Promise.all(
    rows.map((row) => deleteVaultFile({ userId, fileId: row.id, ip }))
  );
  const deleted = deleteResults.filter(Boolean).length;
  return { deleted, total: rows.length };
}
