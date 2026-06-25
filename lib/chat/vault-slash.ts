/**
 * Vault slash commands — terpisah dari upload chat biasa.
 *
 * Chat Mode (default):
 *   /v                  → masuk Vault Mode (session terisolasi)
 *   /share-to-ai <id>   → bagikan isi file ke AI (dengan consent)
 *
 * Vault Mode (di dalam mode terisolasi, tanpa prefix `/v`):
 *   list                → daftar file
 *   read <nama|id>      → tampilkan metadata (+ isi text bila possible)
 *   add                 → upload file baru
 *   #T <isi>            → simpan catatan teks langsung (tanpa upload file)
 *   update <id> ...     → update metadata
 *   delete <nama|id>    → hapus file
 *   exit | /chat        → keluar Vault Mode
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

const LIST_FILTER_ALIASES: Record<string, string> = {
  image: "image",
  foto: "image",
  gambar: "image",
  photo: "image",
  video: "video",
  audio: "audio",
  pdf: "pdf",
  doc: "docx",
  docx: "docx",
  text: "text",
  txt: "text",
  pinned: "pinned",
  pin: "pinned",
  favorit: "pinned",
};

export type VaultListQuery = {
  fileType?: string;
  pinnedOnly?: boolean;
  folder?: string;
  sortBy?: "default" | "recent";
  filterLabel?: string;
  limit?: number;
};

export function parseVaultModeListQuery(text: string): VaultListQuery | null {
  const raw = text.trim();
  const lower = raw.toLowerCase();
  if (parseVaultModeBareList(raw)) {
    return { sortBy: "default", filterLabel: "Semua file" };
  }
  const folderMatch = lower.match(/^\/?(?:list|ls)\s+folder:(\S+)/);
  const folderName = folderMatch?.[1];
  if (folderName) {
    return { folder: folderName, filterLabel: `Folder: ${folderName}` };
  }
  const match = lower.match(/^\/?(?:list|ls)\s+(\S+)/);
  const token = match?.[1];
  if (!token) {
    return null;
  }
  const mapped = LIST_FILTER_ALIASES[token];
  if (mapped === "pinned") {
    return { pinnedOnly: true, filterLabel: "Favorit" };
  }
  if (mapped) {
    return { fileType: mapped, filterLabel: token };
  }
  return null;
}

export function parseVaultModeRecent(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "recent" || t === "/recent" || t === "terbaru";
}

export function parseVaultModeStats(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "stats" || t === "/stats" || t === "stat" || t === "info";
}

export type VaultPinAction = {
  target: string;
  pinned: boolean;
};

export function parseVaultModePin(text: string): VaultPinAction | null {
  const pinMatch = text.trim().match(/^\/?(?:pin|favorit)\s+(.+)/is);
  if (pinMatch?.[1]?.trim()) {
    return { target: pinMatch[1].trim(), pinned: true };
  }
  const unpinMatch = text.trim().match(/^\/?(?:unpin|unfavorit)\s+(.+)/is);
  if (unpinMatch?.[1]?.trim()) {
    return { target: unpinMatch[1].trim(), pinned: false };
  }
  return null;
}

export type VaultRenameAction = {
  target: string;
  name: string;
};

export function parseVaultModeRename(text: string): VaultRenameAction | null {
  const match = text.trim().match(/^\/?rename\s+(\S+)\s+(.+)/is);
  const target = match?.[1]?.trim();
  const name = match?.[2]?.trim();
  if (!target || !name) {
    return null;
  }
  return { target, name: name.slice(0, 255) };
}

export function parseVaultModeSearch(text: string): string | null {
  const match = text.trim().match(/^\/?(?:search|cari)\s+(.+)/is);
  const query = match?.[1]?.trim();
  return query && query.length >= 2 ? query : null;
}

export function parseVaultModeBulkTag(text: string): {
  tag: string;
  targets: string[];
} | null {
  const match = text.trim().match(/^\/?bulk\s+tag\s+(\S+)\s+(.+)/is);
  const tag = match?.[1]?.trim();
  const rest = match?.[2]?.trim();
  if (!tag || !rest) {
    return null;
  }
  const targets = rest.split(/\s+/).filter(Boolean);
  if (targets.length === 0) {
    return null;
  }
  return { tag: tag.slice(0, 64), targets };
}

export type VaultBulkDeleteFilter = {
  tag?: string;
  fileType?: string;
};

export function parseVaultModeBulkDelete(
  text: string
): VaultBulkDeleteFilter | null {
  const match = text.trim().match(/^\/?bulk\s+delete\s+(tag|type):(\S+)/is);
  const kind = match?.[1]?.toLowerCase();
  const value = match?.[2]?.trim();
  if (!kind || !value) {
    return null;
  }
  if (kind === "tag") {
    return { tag: value.slice(0, 64) };
  }
  return { fileType: value };
}

export function parseVaultModeTrash(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "trash" || t === "/trash" || t === "sampah";
}

export function parseVaultModeRestore(text: string): string | null {
  const match = text.trim().match(/^\/?restore\s+(.+)/is);
  const target = match?.[1]?.trim();
  return target && target.length >= 1 ? target : null;
}

export function parseVaultModePurgeTrash(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "purge trash" ||
    t === "empty trash" ||
    t === "kosongkan sampah" ||
    t === "purge"
  );
}

export type VaultMoveFolder = {
  target: string;
  folder: string;
};

export function parseVaultModeMoveFolder(text: string): VaultMoveFolder | null {
  const match = text.trim().match(/^\/?move\s+(\S+)\s+(.+)/is);
  const target = match?.[1]?.trim();
  let folder = match?.[2]?.trim();
  if (!target || !folder) {
    return null;
  }
  folder = folder.replace(/^folder:/i, "").trim();
  if (!folder) {
    return null;
  }
  return { target, folder: folder.slice(0, 64) };
}

export function parseVaultModeFolders(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === "folders" || t === "/folders" || t === "folder list";
}

export function parseVaultModeInfo(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t === "i" ||
    t === "/i" ||
    t === "info" ||
    t === "help" ||
    t === "/help" ||
    t === "?" ||
    t === "menu" ||
    t === "fitur" ||
    t === "bantuan"
  );
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

/** `#T isi catatan` — simpan teks langsung ke berangkas tanpa upload file. */
export function parseVaultModeTextNote(text: string): string | null {
  const trimmed = text.trim();
  if (!/^#T\b/is.test(trimmed)) {
    return null;
  }
  const match = trimmed.match(/^#T\s*:?\s*(.*)/is);
  return match?.[1]?.trim() ?? "";
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
    description: "Masuk Vault Mode (AI OFF — list, upload, read di dalam mode)",
    kind: "send",
    sendText: "/v",
  },
  {
    name: "share-to-ai",
    description: "⚠️ Bagikan isi file Vault ke AI (sadar consent)",
    kind: "insert",
    insertText: "/share-to-ai ",
  },
];

/** Perintah lama di Chat Mode — arahkan user ke Vault Mode. */
export function isLegacyVaultChatCommand(text: string): boolean {
  return (
    isBareVaultUp(text) ||
    parseVaultList(text) ||
    parseVaultGet(text) !== null ||
    parseVaultDelete(text) !== null
  );
}
