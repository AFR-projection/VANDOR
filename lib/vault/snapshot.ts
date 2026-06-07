import type { VaultFile } from "@/lib/db/schema";
import type { VaultFileSnapshot } from "./types";

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
  >,
  similarity?: number
): VaultFileSnapshot {
  return {
    id: row.id,
    name: row.fileName,
    type: row.fileType as VaultFileSnapshot["type"],
    mimeType: row.mimeType,
    size: row.fileSize,
    summary: row.summary,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    sourceType: row.sourceType as VaultFileSnapshot["sourceType"],
    createdAt: row.createdAt.toISOString(),
    ...(similarity !== undefined ? { similarity } : {}),
  };
}
