import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { hasR2Storage, isServerlessRuntime } from "@/lib/storage/config";
import { deleteR2Object, getR2Object, putR2Object } from "@/lib/storage/r2";

const LOCAL_VAULT_DIR = path.join(process.cwd(), "data", "vault");

export type VaultStorageBackend = "r2" | "local";

export async function vaultStorageAvailable(): Promise<boolean> {
  return (await hasR2Storage()) || !isServerlessRuntime();
}

export function buildVaultKey(userId: string, fileId: string): string {
  return `vault/${userId}/${fileId}.enc`;
}

function localPath(key: string): string {
  return path.join(LOCAL_VAULT_DIR, key.replace(/\//g, path.sep));
}

export async function putEncryptedBlob(
  key: string,
  ciphertext: Buffer
): Promise<VaultStorageBackend> {
  if (await hasR2Storage()) {
    await putR2Object(key, ciphertext, "application/octet-stream");
    return "r2";
  }

  if (isServerlessRuntime()) {
    throw new Error(
      "Vault storage requires R2 in serverless. Atur Cloudflare R2 di Pengaturan → API & integrasi."
    );
  }

  const full = localPath(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, ciphertext);
  return "local";
}

export async function getEncryptedBlob(
  key: string,
  backend: VaultStorageBackend
): Promise<Buffer> {
  if (backend === "r2") {
    return getR2Object(key);
  }
  return readFile(localPath(key));
}

export async function deleteEncryptedBlob(
  key: string,
  backend: VaultStorageBackend
): Promise<void> {
  if (backend === "r2") {
    await deleteR2Object(key);
    return;
  }
  try {
    await unlink(localPath(key));
  } catch {
    /* file may already be gone */
  }
}
