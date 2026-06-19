/**
 * Vault slash commands — terpisah dari upload chat biasa.
 *
 * Chat Mode (default):
 *   /v             → masuk Vault Mode
 *   /v list        → daftar file
 *   /v get <q>     → info metadata
 *   /v del <q>     → hapus file
 *   /v up          → trigger upload UI
 *   /share-to-ai <id> → bagikan isi file ke AI (chat mode only, dengan warning)
 *
 * Vault Mode (di dalam mode terisolasi, tanpa prefix `/v`):
 *   list           → daftar file
 *   read <q>       → tampilkan metadata (+ isi text bila possible)
 *   add            → trigger upload UI
 *   update <id> ...→ update metadata
 *   delete <q>     → hapus file
 *   exit | /chat   → keluar Vault Mode
 */

export type VaultSlashOpen = {
  fileId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isVaultFileId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

// ── Chat Mode parsers (existing API) ─────────────────────────────────

/** Entry to Vault Mode: bare `/v` (or `/vault`). */
export function parseVaultEnter(text: string): boolean {
  return /^\/?(?:v|vault)\s*$/i.test(text.trim());
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

/** `/share-to-ai <id>` — explicit consent to leak vault file to AI. */
export function parseShareToAi(text: string): VaultSlashOpen | null {
  const match = text
    .trim()
    .match(/^\/?(?:share-to-ai|ai-read|share2ai)\s+(\S+)/i);
  const id = match?.[1]?.trim();
  if (!id || !isVaultFileId(id)) {
    return null;
  }
  return { fileId: id };
}

// ── Vault Mode parsers (bare commands, only valid IN vault mode) ─────

export function parseVaultModeExit(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "exit" || t === "/exit" || t === "/chat" || t === "quit" || t === "/q"
  );
}

export function parseVaultModeBareList(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "list" || t === "ls" || t === "/list" || t === "/ls";
}

export function parseVaultModeRead(text: string): string | null {
  const match = text.trim().match(/^\/?(?:read|cat|show|get)\s+(.+)/is);
  const target = match?.[1]?.trim();
  return target && target.length >= 1 ? target : null;
}

export function parseVaultModeAdd(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "add" || t === "upload" || t === "/add" || t === "/upload" || t === "up"
  );
}

export function parseVaultModeDelete(text: string): string | null {
  const match = text.trim().match(/^\/?(?:delete|del|rm|remove)\s+(.+)/is);
  const target = match?.[1]?.trim();
  return target && target.length >= 1 ? target : null;
}

export type VaultModeUpdate = {
  target: string;
  /** Free-form patch text: "tags:work,private" or "summary: My CV". */
  patch: string;
};

export function parseVaultModeUpdate(text: string): VaultModeUpdate | null {
  const match = text.trim().match(/^\/?(?:update|edit|tag)\s+(\S+)\s+(.+)/is);
  const target = match?.[1]?.trim();
  const patch = match?.[2]?.trim();
  if (!target || !patch) return null;
  return { target, patch };
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
    name: "v",
    description: "Masuk Vault Mode (AI OFF, mode terisolasi)",
    kind: "send",
    sendText: "/v",
  },
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
    name: "v del",
    description: "Hapus file dari Vault",
    kind: "insert",
    insertText: "/v del ",
  },
  {
    name: "share-to-ai",
    description: "⚠️ Bagikan isi file Vault ke AI (sadar consent)",
    kind: "insert",
    insertText: "/share-to-ai ",
  },
];
