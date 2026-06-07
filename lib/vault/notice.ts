import type { VaultFileSnapshot } from "./types";

export type VaultListNotice = {
  files: VaultFileSnapshot[];
  total: number;
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
