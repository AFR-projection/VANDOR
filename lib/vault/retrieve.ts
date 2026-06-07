import "server-only";

import { decryptBuffer } from "@/lib/security/file-crypto";
import { logVaultAction } from "./audit";
import { getVaultFileById } from "./queries";
import { getEncryptedBlob } from "./storage";

export type DecryptedVaultFile = {
  data: Buffer;
  fileName: string;
  mimeType: string;
  fileSize: number;
};

/**
 * Decrypt vault file on user request only.
 * Every decrypt is audit-logged.
 */
export async function decryptVaultFile({
  userId,
  fileId,
  ip,
  audit = true,
  auditDetail,
}: {
  userId: string;
  fileId: string;
  ip?: string;
  audit?: boolean;
  auditDetail?: Record<string, unknown>;
}): Promise<DecryptedVaultFile | null> {
  const record = await getVaultFileById({ userId, fileId });
  if (!record) {
    return null;
  }

  const ciphertext = await getEncryptedBlob(
    record.r2Key,
    record.storageBackend as "r2" | "local"
  );

  const data = decryptBuffer(ciphertext, record.encIv, record.encTag);

  if (audit) {
    await logVaultAction({
      userId,
      fileId,
      action: "decrypt",
      detail: { fileName: record.fileName, ...auditDetail },
      ip,
    });
  }

  return {
    data,
    fileName: record.fileName,
    mimeType: record.mimeType,
    fileSize: record.fileSize,
  };
}

/** Stream-friendly download with separate download audit entry. */
export async function downloadVaultFile({
  userId,
  fileId,
  ip,
}: {
  userId: string;
  fileId: string;
  ip?: string;
}): Promise<DecryptedVaultFile | null> {
  const decrypted = await decryptVaultFile({ userId, fileId, ip });
  if (!decrypted) {
    return null;
  }

  await logVaultAction({
    userId,
    fileId,
    action: "download",
    detail: { fileName: decrypted.fileName, size: decrypted.fileSize },
    ip,
  });

  return decrypted;
}
