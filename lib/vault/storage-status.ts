import "server-only";

import { hasR2Storage } from "@/lib/storage/config";

export type VaultStorageStatus = {
  available: boolean;
  activeBackend: "r2" | "local" | "none";
  storageLabel: string;
  encrypted: boolean;
  algorithm: string;
  metadata: string;
  /** Vault blobs are never served via public R2 URL — only via authenticated API. */
  publicAccess: false;
};

export function getVaultStorageStatus(): VaultStorageStatus {
  const r2 = hasR2Storage();

  if (r2) {
    return {
      available: true,
      activeBackend: "r2",
      storageLabel: "Cloudflare R2 (encrypted blobs)",
      encrypted: true,
      algorithm: "AES-256-GCM",
      metadata: "Neon PostgreSQL + pgvector",
      publicAccess: false,
    };
  }

  return {
    available: true,
    activeBackend: "local",
    storageLabel: "Local disk (dev) — set R2_* for production",
    encrypted: true,
    algorithm: "AES-256-GCM",
    metadata: "Neon PostgreSQL + pgvector",
    publicAccess: false,
  };
}
