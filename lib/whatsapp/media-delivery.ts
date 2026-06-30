import "server-only";

import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import { downloadSocialMedia } from "@/lib/media/download";
import type { MediaDownloadFormat } from "@/lib/media/types";
import { recordMediaDownloadLog } from "@/lib/observability/log-media";

export type WhatsappMediaDeliveryResult = {
  handled: boolean;
  caption?: string;
};

/** WhatsApp video limit ~16MB untuk kirim sebagai video; lebih besar → dokumen. */
const WA_VIDEO_BYTES_MAX = 16 * 1024 * 1024;

function mimeFor(format: MediaDownloadFormat, contentType?: string): string {
  if (contentType?.includes("/")) {
    return contentType.split(";")[0]?.trim() ?? "application/octet-stream";
  }
  return format === "audio" ? "audio/mpeg" : "video/mp4";
}

/**
 * Handle /tt, /ig slash commands on WhatsApp.
 * Downloads media and sends the file directly (buffer, tanpa re-fetch R2).
 */
export async function deliverWhatsappMediaDownload(
  sock: WASocket,
  jid: string,
  text: string,
  msg: WAMessage,
  userId: string
): Promise<WhatsappMediaDeliveryResult> {
  const slash = parseMediaSlash(text.trim());
  if (!slash) {
    return { handled: false };
  }

  await sock.sendMessage(
    jid,
    {
      text: `⏳ Mengunduh dari ${slash.platform}… tunggu sebentar.`,
    },
    { quoted: msg }
  );

  const result = await downloadSocialMedia({
    url: slash.url,
    format: slash.format,
    platform: slash.platform,
    retainBuffer: true,
  });

  recordMediaDownloadLog({
    userId,
    command: slash.command,
    url: slash.url,
    result,
  });

  if (!result.ok || !result.buffer?.length) {
    const err = result.error ?? "Unduhan gagal";
    await sock.sendMessage(
      jid,
      { text: `❌ Gagal unduh ${slash.platform}: ${err}` },
      { quoted: msg }
    );
    return { handled: true, caption: err };
  }

  try {
    const buffer = result.buffer;
    const filename =
      result.filename ??
      `vandor-${slash.platform}.${slash.format === "audio" ? "mp3" : "mp4"}`;
    const mimetype = mimeFor(slash.format, result.contentType);
    const caption = result.title
      ? `✅ ${result.title}\n_via VANDOR · ${slash.platform}_`
      : `✅ Unduhan ${slash.platform} selesai`;

    if (slash.format === "audio") {
      await sock.sendMessage(
        jid,
        {
          audio: buffer,
          mimetype,
          fileName: filename,
          ptt: false,
        },
        { quoted: msg }
      );
    } else if (buffer.length > WA_VIDEO_BYTES_MAX) {
      await sock.sendMessage(
        jid,
        {
          document: buffer,
          mimetype,
          fileName: filename,
          caption: `${caption}\n_(video besar — dikirim sebagai file)_`,
        },
        { quoted: msg }
      );
    } else {
      await sock.sendMessage(
        jid,
        {
          video: buffer,
          mimetype,
          fileName: filename,
          caption,
        },
        { quoted: msg }
      );
    }

    return { handled: true, caption };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Kirim file gagal";
    await sock.sendMessage(
      jid,
      {
        text: `❌ Unduhan selesai tapi gagal kirim ke WhatsApp: ${message}`,
      },
      { quoted: msg }
    );
    return { handled: true, caption: message };
  }
}
