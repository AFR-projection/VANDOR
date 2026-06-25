import "server-only";

import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import { downloadSocialMedia } from "@/lib/media/download";
import type { MediaDownloadFormat } from "@/lib/media/types";
import { recordMediaDownloadLog } from "@/lib/observability/log-media";

export type WhatsappMediaDeliveryResult = {
  handled: boolean;
  caption?: string;
};

async function fetchBufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Gagal mengambil file (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function mimeFor(format: MediaDownloadFormat, contentType?: string): string {
  if (contentType?.includes("/")) {
    return contentType.split(";")[0]?.trim() ?? "application/octet-stream";
  }
  return format === "audio" ? "audio/mpeg" : "video/mp4";
}

/**
 * Handle /tt, /ytv, /yts, /ig slash commands on WhatsApp.
 * Downloads media and sends the file directly to the chat (not just a link).
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
  });

  recordMediaDownloadLog({
    userId,
    command: slash.command,
    url: slash.url,
    result,
  });

  if (!result.ok || !result.url) {
    const err = result.error ?? "Unduhan gagal";
    await sock.sendMessage(
      jid,
      { text: `❌ Gagal unduh ${slash.platform}: ${err}` },
      { quoted: msg }
    );
    return { handled: true, caption: err };
  }

  try {
    const buffer = await fetchBufferFromUrl(result.url);
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
        text: `⚠️ Unduhan berhasil tapi gagal kirim file: ${message}\n\nLink: ${result.url}`,
      },
      { quoted: msg }
    );
    return { handled: true, caption: message };
  }
}
