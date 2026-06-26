import "server-only";

import { randomUUID } from "node:crypto";
import { classify, isExtractable } from "@/lib/files/mime";
import { encryptBuffer } from "@/lib/security/file-crypto";
import { logVaultAction } from "./audit";
import { embedVaultFileRecord, insertVaultFileRow } from "./queries";
import {
  buildVaultKey,
  putEncryptedBlob,
  vaultStorageAvailable,
} from "./storage";
import type { StoreVaultFileInput, VaultFileSnapshot } from "./types";
import { toVaultSnapshot } from "./snapshot";

const MAX_EXTRACT_CHARS = 8000;

async function extractTextForIndex(
  data: Buffer,
  mimeType: string,
  fileName: string
): Promise<string | null> {
  const kind = classify(mimeType, fileName);
  if (!isExtractable(kind)) {
    return null;
  }
  try {
    const { extractFromBuffer } = await import("@/lib/files/extract");
    const result = await extractFromBuffer(data, mimeType, fileName);
    if (!result?.text) {
      return null;
    }
    return result.text.slice(0, MAX_EXTRACT_CHARS);
  } catch {
    return null;
  }
}

function defaultSummary(fileName: string, fileType: string): string {
  return `${fileType} file: ${fileName}`;
}

/**
 * Encrypt file → store in R2/local → persist metadata in Neon.
 * Raw bytes never touch the database.
 */
export async function storeVaultFile(
  input: StoreVaultFileInput
): Promise<{ ok: true; file: VaultFileSnapshot } | { ok: false; error: string }> {
  if (!(await vaultStorageAvailable())) {
    return {
      ok: false,
      error:
        "Vault storage belum dikonfigurasi. Atur Cloudflare R2 di Pengaturan → API & integrasi.",
    };
  }

  if (!process.env.POSTGRES_URL) {
    return { ok: false, error: "Database not configured" };
  }

  const fileId = randomUUID();
  const r2Key = buildVaultKey(input.userId, fileId);
  const { ciphertext, iv, tag } = encryptBuffer(input.data);

  let storageBackend: "r2" | "local";
  try {
    storageBackend = await putEncryptedBlob(r2Key, ciphertext);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Storage failed";
    return { ok: false, error: msg };
  }

  const extractedText = await extractTextForIndex(
    input.data,
    input.mimeType,
    input.fileName
  );

  let summary = input.summary?.trim();
  let tags = input.tags ?? [];

  const userProvidedMeta =
    Boolean(input.summary?.trim()) || (input.tags?.length ?? 0) > 0;

  if (!userProvidedMeta) {
    try {
      const { suggestVaultMetadata } = await import("./auto-tag");
      const suggested = await suggestVaultMetadata({
        userId: input.userId,
        fileName: input.fileName,
        fileType: input.fileType,
        mimeType: input.mimeType,
        data: input.data,
        extractedText,
        caption:
          typeof input.metadata?.waCaption === "string"
            ? input.metadata.waCaption
            : undefined,
      });
      if (suggested) {
        summary = suggested.summary;
        tags = suggested.tags;
      }
    } catch (error) {
      console.error("Vault auto-tag failed:", error);
    }
  }

  summary = summary || defaultSummary(input.fileName, input.fileType);

  const id = await insertVaultFileRow({
    id: fileId,
    userId: input.userId,
    fileName: input.fileName,
    fileType: input.fileType,
    mimeType: input.mimeType,
    fileSize: input.data.byteLength,
    r2Key,
    encrypted: true,
    encIv: iv,
    encTag: tag,
    summary,
    tags,
    extractedText,
    storageBackend,
    sourceType: input.sourceType ?? "upload",
    sourceChatId: input.sourceChatId ?? null,
    sourceMessageId: input.sourceMessageId ?? null,
    metadata: input.metadata ?? null,
    folder: input.folder ?? null,
  });

  if (!id) {
    try {
      const { deleteEncryptedBlob } = await import("./storage");
      await deleteEncryptedBlob(r2Key, storageBackend);
    } catch (error) {
      console.error("Vault blob rollback failed:", error);
    }
    return { ok: false, error: "Failed to save vault metadata" };
  }

  try {
    await embedVaultFileRecord({
      userId: input.userId,
      fileId: id,
      fileName: input.fileName,
      summary,
      tags,
      extractedText,
    });
  } catch (error) {
    console.error("Vault embedding failed:", error);
  }

  await logVaultAction({
    userId: input.userId,
    fileId: id,
    action: "upload",
    detail: {
      fileName: input.fileName,
      fileType: input.fileType,
      size: input.data.byteLength,
      backend: storageBackend,
    },
    ip: input.ip,
  });

  const snapshot = toVaultSnapshot({
    id,
    fileName: input.fileName,
    fileType: input.fileType,
    mimeType: input.mimeType,
    fileSize: input.data.byteLength,
    summary,
    tags,
    sourceType: input.sourceType ?? "upload",
    pinned: false,
    folder: input.folder ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { ok: true, file: snapshot };
}
