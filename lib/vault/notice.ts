import type { VaultFileSnapshot } from "./types";

export type VaultListNotice = {
  files: VaultFileSnapshot[];
  total: number;
  filterLabel?: string;
  totalBytes?: number;
};

export type VaultOpenNotice = {
  file: VaultFileSnapshot;
  openUrl: string;
  downloadUrl: string;
};

export type VaultDetailNotice = {
  file: VaultFileSnapshot;
  openUrl: string;
  downloadUrl: string;
};

export type VaultUploadNotice = {
  file: VaultFileSnapshot;
};

export type VaultReadNotice = {
  file: VaultFileSnapshot;
  openUrl: string;
  downloadUrl: string;
  /** Inline text content (only when file is text-based and < 32KB). */
  textContent?: string;
  textTruncated?: boolean;
};

export type VaultDeniedNotice = {
  attempted: string;
  reason: string;
};

export type ShareToAiNotice = {
  file: VaultFileSnapshot;
  openUrl: string;
  downloadUrl: string;
};

export type VaultHelpNotice = {
  commands: Array<{ cmd: string; desc: string; group: string }>;
};

export function vaultHelpDataPart(data: VaultHelpNotice): {
  type: "data-vault-help";
  data: VaultHelpNotice;
} {
  return { type: "data-vault-help", data };
}

export function vaultListDataPart(data: VaultListNotice): {
  type: "data-vault-list";
  data: VaultListNotice;
} {
  return { type: "data-vault-list", data };
}

export function vaultOpenDataPart(data: VaultOpenNotice): {
  type: "data-vault-open";
  data: VaultOpenNotice;
} {
  return { type: "data-vault-open", data };
}

export function vaultDetailDataPart(data: VaultDetailNotice): {
  type: "data-vault-detail";
  data: VaultDetailNotice;
} {
  return { type: "data-vault-detail", data };
}

export function vaultUploadDataPart(data: VaultUploadNotice): {
  type: "data-vault-upload";
  data: VaultUploadNotice;
} {
  return { type: "data-vault-upload", data };
}

export function vaultReadDataPart(data: VaultReadNotice): {
  type: "data-vault-read";
  data: VaultReadNotice;
} {
  return { type: "data-vault-read", data };
}

export function vaultDeniedDataPart(data: VaultDeniedNotice): {
  type: "data-vault-denied";
  data: VaultDeniedNotice;
} {
  return { type: "data-vault-denied", data };
}

export function shareToAiDataPart(data: ShareToAiNotice): {
  type: "data-share-to-ai";
  data: ShareToAiNotice;
} {
  return { type: "data-share-to-ai", data };
}

export function vaultUrls(fileId: string): {
  openUrl: string;
  downloadUrl: string;
} {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    openUrl: `${base}/api/vault/${fileId}/open`,
    downloadUrl: `${base}/api/vault/${fileId}/download`,
  };
}
