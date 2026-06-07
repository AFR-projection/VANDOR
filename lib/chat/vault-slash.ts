/**
 * Vault slash commands — terpisah dari upload chat biasa.
 * /v up | /v list | /v get | /v open | /v del
 */

export type VaultSlashOpen = {
  fileId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVaultFileId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function parseVaultOpen(text: string): VaultSlashOpen | null {
  const match = text.trim().match(/^\/?v\s+open\s+(\S+)/i);
  const id = match?.[1]?.trim();
  if (!id || !isVaultFileId(id)) {
    return null;
  }
  return { fileId: id };
}

export function isBareVaultUp(text: string): boolean {
  return /^\/?v\s+up\s*$/i.test(text.trim());
}

export function parseVaultUploaded(text: string): VaultSlashOpen | null {
  const match = text.trim().match(/^\/?v\s+uploaded\s+(\S+)/i);
  const id = match?.[1]?.trim();
  if (!id || !isVaultFileId(id)) {
    return null;
  }
  return { fileId: id };
}

export function parseVaultList(text: string): boolean {
  return /^\/?v\s+list\s*$/i.test(text.trim());
}

export function parseVaultGet(text: string): string | null {
  const match = text.trim().match(/^\/?v\s+get\s+(.+)/is);
  const query = match?.[1]?.trim();
  return query && query.length >= 1 ? query : null;
}

export function parseVaultDelete(text: string): string | null {
  const match = text.trim().match(/^\/?v\s+del(?:ete)?\s+(.+)/is);
  const target = match?.[1]?.trim();
  return target && target.length >= 1 ? target : null;
}

export type VaultSlashSkill = {
  name: string;
  description: string;
  kind: "ui" | "insert" | "send";
  action?: string;
  insertText?: string;
  sendText?: string;
};

export const VAULT_SLASH_SKILLS: VaultSlashSkill[] = [
  {
    name: "v up",
    description: "Upload file ke Vault terenkripsi (R2)",
    kind: "ui",
    action: "vault_upload",
  },
  {
    name: "v list",
    description: "Daftar file di Vault (metadata saja)",
    kind: "send",
    sendText: "/v list",
  },
  {
    name: "v get",
    description: "Info metadata file Vault (nama, tipe, tag)",
    kind: "insert",
    insertText: "/v get ",
  },
  {
    name: "v open",
    description: "Buka file Vault untuk AI — hanya sesi chat ini",
    kind: "insert",
    insertText: "/v open ",
  },
  {
    name: "v del",
    description: "Hapus file dari Vault",
    kind: "insert",
    insertText: "/v del ",
  },
];

export const VAULT_SKILL_SYSTEM_HINT = `
## Personal Vault (/v up, /v list, /v get, /v open, /v del)
- Vault **terpisah** dari lampiran chat biasa. Upload chat (📎) **bukan** Vault.
- \`manageVault\` — hanya metadata (id, name, type, summary, tags). **Jangan** baca isi file Vault kecuali user pakai \`/v open <id>\` di chat aktif.
- Simpan ke Vault: user pakai \`/v up\` lalu pilih file, atau minta user upload lewat command tersebut.
- Cari file: \`manageVault\` action search/list, atau user ketik \`/v list\` / \`/v get <nama>\`.
- Buka untuk AI: hanya setelah \`/v open <id>\` — file didekripsi untuk percakapan ini saja.
`.trim();
