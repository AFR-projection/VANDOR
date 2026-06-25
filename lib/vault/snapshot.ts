import type { VaultFile } from "@/lib/db/schema";
import type { VaultFileSnapshot } from "./types";
import { resolveVaultDisplayName } from "./display-name";

/** Strip sensitive fields — LLM receives only this shape. */
export function toVaultSnapshot(
  row: Pick<
    VaultFile,
    | "id"
    | "fileName"
    | "fileType"
    | "mimeType"
    | "fileSize"
    | "summary"
    | "tags"
    | "sourceType"
    | "createdAt"
    | "updatedAt"
    | "pinned"
    | "folder"
  >,
  similarity?: number
): VaultFileSnapshot {
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
  return {
    id: row.id,
    name: resolveVaultDisplayName({
      fileName: row.fileName,
      summary: row.summary,
      tags,
    }),
    storageName: row.fileName,
    type: row.fileType as VaultFileSnapshot["type"],
    mimeType: row.mimeType,
    size: row.fileSize,
    summary: row.summary,
    tags,
    pinned: row.pinned ?? false,
    folder: row.folder ?? null,
    sourceType: row.sourceType as VaultFileSnapshot["sourceType"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt?.toISOString(),
    ...(similarity !== undefined ? { similarity } : {}),
  };
}
