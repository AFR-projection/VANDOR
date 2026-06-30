import "server-only";

import { storeVaultFile } from "./store";

export const MAX_VAULT_TEXT_NOTE_CHARS = 50_000;

export function buildVaultNoteFileName(content: string): string {
  const firstLine = content.split(/\r?\n/)[0]?.trim() || "catatan";
  const slug =
    firstLine
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 40)
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "catatan";
  return `${slug}-${Date.now()}.txt`;
}

export function noteSummaryFromContent(content: string): string {
  const first = content
    .split(/\r?\n/)
    .find((line) => line.trim())
    ?.trim();
  return (first ?? content).slice(0, 500);
}

export async function storeVaultTextNote({
  userId,
  content,
  chatId,
  ip,
}: {
  userId: string;
  content: string;
  chatId?: string;
  ip?: string;
}) {
  const trimmed = content.trim().slice(0, MAX_VAULT_TEXT_NOTE_CHARS);
  const fileName = buildVaultNoteFileName(trimmed);
  const summary = noteSummaryFromContent(trimmed);

  return storeVaultFile({
    userId,
    fileName,
    mimeType: "text/plain; charset=utf-8",
    fileType: "text",
    data: Buffer.from(trimmed, "utf-8"),
    summary,
    tags: ["catatan"],
    sourceType: "note",
    sourceChatId: chatId,
    metadata: { noteType: "vault-hash-t" },
    ip,
  });
}
