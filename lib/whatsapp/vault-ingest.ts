import "server-only";

import { storeVaultFile } from "@/lib/vault/store";
import type { VaultFileSnapshot } from "@/lib/vault/types";
import { resolveVaultUserId } from "@/lib/vault/vault-scope";
import type { WhatsappInboundMedia } from "./inbound-media";

const VAULT_SAVE_RE =
  /^(\/?v\s+save|\/?vault\s+save|\/?vault|simpan\s+(?:ke\s+)?vault|save\s+(?:to\s+)?vault)/i;

export function isWhatsappVaultSaveCommand(text: string): boolean {
  return VAULT_SAVE_RE.test(text.trim());
}

export function vaultSaveReplyText(
  result: { ok: true; file: VaultFileSnapshot } | { ok: false; error: string }
): string {
  if (result.ok) {
    const shortId = result.file.id.slice(0, 8);
    const tagNote =
      result.file.tags.length > 0
        ? `\nTags: ${result.file.tags.slice(0, 4).join(", ")}`
        : "";
    return `✅ *Tersimpan di Berangkas*\n\n*${result.file.name}*\nID: \`${shortId}…\`${tagNote}\n\nBuka Vault Mode di web (\`/v\`) untuk kelola file.`;
  }
  return `❌ Gagal simpan ke berangkas: ${result.error}`;
}

/**
 * Encrypt inbound WhatsApp media into the owner's vault.
 */
export async function ingestWhatsappMediaToVault({
  sessionUserId,
  chatId,
  media,
  caption,
}: {
  sessionUserId: string;
  chatId: string;
  media: WhatsappInboundMedia;
  caption?: string;
}): Promise<
  { ok: true; file: VaultFileSnapshot } | { ok: false; error: string }
> {
  const vaultUserId = await resolveVaultUserId(sessionUserId);
  const summary = caption?.trim() || media.caption?.trim() || undefined;

  const stored = await storeVaultFile({
    userId: vaultUserId,
    fileName: media.filename,
    mimeType: media.mime,
    fileType: media.kind,
    data: media.buffer,
    summary,
    sourceType: "whatsapp",
    sourceChatId: chatId,
    metadata: {
      channel: "whatsapp",
      waCaption: media.caption ?? null,
    },
  });

  if (stored.ok && !stored.file.tags.includes("whatsapp")) {
    const { updateVaultFileMeta } = await import("@/lib/vault/queries");
    await updateVaultFileMeta({
      userId: vaultUserId,
      fileId: stored.file.id,
      tags: ["whatsapp", ...stored.file.tags].slice(0, 20),
    });
  }

  return stored;
}
