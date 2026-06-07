import "server-only";

/** Only `/open` URLs allow server-side decrypt for active chat — not `/download`. */
const VAULT_OPEN_RE =
  /\/api\/vault\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/open/i;

export function parseVaultFileId(url: string): string | null {
  try {
    const pathname = url.startsWith("/") ? url : new URL(url).pathname;
    const match = pathname.match(VAULT_OPEN_RE);
    return match?.[1] ?? null;
  } catch {
    const match = url.match(VAULT_OPEN_RE);
    return match?.[1] ?? null;
  }
}

export function isVaultOpenUrl(url: string): boolean {
  return parseVaultFileId(url) !== null;
}

/** Decrypt vault blob when user explicitly opened file for this chat session. */
export async function readVaultAttachment(
  userId: string,
  url: string
): Promise<{ data: Buffer; mimeType: string; fileName: string } | null> {
  const fileId = parseVaultFileId(url);
  if (!fileId) {
    return null;
  }
  const { decryptVaultFile } = await import("@/lib/vault/retrieve");
  const file = await decryptVaultFile({ userId, fileId });
  if (!file) {
    return null;
  }
  return {
    data: file.data,
    mimeType: file.mimeType,
    fileName: file.fileName,
  };
}
