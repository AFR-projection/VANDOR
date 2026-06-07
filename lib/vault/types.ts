import type { VaultFileType, VaultSourceType } from "@/lib/db/schema";

/** Safe metadata exposed to LLM tools — never includes raw file bytes or full extracted text. */
export type VaultFileSnapshot = {
  id: string;
  name: string;
  type: VaultFileType;
  mimeType: string;
  size: number;
  summary: string | null;
  tags: string[];
  sourceType: VaultSourceType;
  createdAt: string;
  similarity?: number;
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
  ip?: string;
};

export type VaultSearchResult = {
  files: VaultFileSnapshot[];
  total: number;
};
