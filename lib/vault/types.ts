import type { VaultFileType, VaultSourceType } from "@/lib/db/schema";

/** Safe metadata exposed to LLM tools — never includes raw file bytes or full extracted text. */
export type VaultFileSnapshot = {
  id: string;
  /** Nama tampilan untuk list/kartu (bisa dari fileName, ringkasan, atau tag). */
  name: string;
  /** Nama file asli di storage/DB (untuk unduh). */
  storageName?: string;
  type: VaultFileType;
  mimeType: string;
  size: number;
  summary: string | null;
  tags: string[];
  pinned?: boolean;
  folder?: string | null;
  sourceType: VaultSourceType;
  createdAt: string;
  updatedAt?: string;
  similarity?: number;
};

export type VaultStats = {
  totalFiles: number;
  totalBytes: number;
  pinnedCount: number;
  byType: Record<string, number>;
};

export type StoreVaultFileInput = {
  userId: string;
  fileName: string;
  mimeType: string;
  fileType: VaultFileType;
  data: Buffer;
  summary?: string;
  tags?: string[];
  sourceType?: VaultSourceType;
  sourceChatId?: string;
  sourceMessageId?: string;
  metadata?: Record<string, unknown>;
  folder?: string | null;
  ip?: string;
};

export type VaultSearchResult = {
  files: VaultFileSnapshot[];
  total: number;
};
