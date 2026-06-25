import "server-only";

import type { WASocket, WAMessage } from "@whiskeysockets/baileys";
import {
  downloadMediaMessage,
  extensionForMediaMessage,
  getContentType,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { extractFromBuffer } from "@/lib/files/extract";
import { classify, type FileKind } from "@/lib/files/mime";
import { putFile } from "@/lib/storage/blob";

const MAX_BYTES = 16 * 1024 * 1024;
const SILENT_LOGGER = pino({ level: "silent" });

export type WhatsappInboundMedia = {
  kind: FileKind;
  mime: string;
  filename: string;
  buffer: Buffer;
  url: string;
  caption?: string;
  extractedText?: string;
};

const MEDIA_TYPES = new Set([
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "stickerMessage",
]);

export function hasInboundMedia(message: WAMessage["message"]): boolean {
  const normalized = normalizeMessageContent(message);
  const type = getContentType(normalized);
  return Boolean(type && MEDIA_TYPES.has(type));
}

function mimeFromMessage(
  content: NonNullable<ReturnType<typeof normalizeMessageContent>>,
  type: string
): string {
  switch (type) {
    case "imageMessage":
      return content.imageMessage?.mimetype ?? "image/jpeg";
    case "videoMessage":
      return content.videoMessage?.mimetype ?? "video/mp4";
    case "audioMessage":
      return content.audioMessage?.mimetype ?? "audio/ogg; codecs=opus";
    case "documentMessage":
      return content.documentMessage?.mimetype ?? "application/octet-stream";
    case "stickerMessage":
      return content.stickerMessage?.mimetype ?? "image/webp";
    default:
      return "application/octet-stream";
  }
}

function filenameFromMessage(
  content: NonNullable<ReturnType<typeof normalizeMessageContent>>,
  type: string
): string {
  const ext = extensionForMediaMessage(content) || "bin";
  if (type === "documentMessage") {
    return content.documentMessage?.fileName ?? `document.${ext}`;
  }
  if (type === "audioMessage") {
    return content.audioMessage?.ptt ? `voice-note.${ext}` : `audio.${ext}`;
  }
  if (type === "imageMessage") {
    return `photo.${ext}`;
  }
  if (type === "videoMessage") {
    return `video.${ext}`;
  }
  if (type === "stickerMessage") {
    return `sticker.${ext}`;
  }
  return `media.${ext}`;
}

function captionFromMessage(
  content: NonNullable<ReturnType<typeof normalizeMessageContent>>,
  type: string
): string | undefined {
  switch (type) {
    case "imageMessage":
      return content.imageMessage?.caption?.trim() || undefined;
    case "videoMessage":
      return content.videoMessage?.caption?.trim() || undefined;
    case "documentMessage":
      return content.documentMessage?.caption?.trim() || undefined;
    default:
      return undefined;
  }
}

export function defaultPromptForMedia(media: WhatsappInboundMedia[]): string {
  const kind = media[0]?.kind;
  switch (kind) {
    case "image":
      return "Apa isi gambar ini? Jelaskan secara detail.";
    case "video":
      return "User mengirim video. Jelaskan apa yang kamu bisa bantu terkait video ini.";
    case "audio":
      return "Transkripsikan dan tanggapi pesan suara ini.";
    case "pdf":
    case "docx":
    case "xlsx":
    case "csv":
    case "text":
      return "Ringkas dan jawab pertanyaan tentang dokumen ini.";
    default:
      return "Analisis file yang dikirim user dan bantu sesuai isinya.";
  }
}

/**
 * Download media attached to a WhatsApp message, store it, and optionally
 * extract text from documents.
 */
export async function extractInboundMedia(
  sock: WASocket,
  msg: WAMessage
): Promise<WhatsappInboundMedia | null> {
  const normalized = normalizeMessageContent(msg.message);
  const type = getContentType(normalized);
  if (!normalized || !type || !MEDIA_TYPES.has(type)) {
    return null;
  }

  let buffer: Buffer;
  try {
    buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      {
        logger: SILENT_LOGGER,
        reuploadRequest: async (message) => {
          await sock.requestPlaceholderResend(message.key, message);
          return message;
        },
      }
    );
  } catch (error) {
    console.error("[wa] media download failed:", error);
    return null;
  }

  if (buffer.byteLength > MAX_BYTES) {
    console.warn(
      `[wa] media too large (${buffer.byteLength} bytes), skipping`
    );
    return null;
  }

  const mime = mimeFromMessage(normalized, type);
  const filename = filenameFromMessage(normalized, type);
  const kind = classify(mime, filename);
  const caption = captionFromMessage(normalized, type);

  let url: string;
  try {
    const stored = await putFile(`wa-in/${filename}`, buffer, {
      contentType: mime,
      addRandomSuffix: true,
    });
    url = stored.url;
  } catch (error) {
    console.error("[wa] media storage failed:", error);
    return null;
  }

  let extractedText: string | undefined;
  try {
    const extracted = await extractFromBuffer(buffer, mime, filename);
    extractedText = extracted?.text?.trim() || undefined;
  } catch {
    extractedText = undefined;
  }

  return {
    kind,
    mime,
    filename,
    buffer,
    url,
    caption,
    extractedText,
  };
}
