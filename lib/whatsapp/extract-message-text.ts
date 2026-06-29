import type { WAMessage } from "@whiskeysockets/baileys";

type MessageContent = NonNullable<WAMessage["message"]>;

function unwrapMessage(message: MessageContent | null | undefined): MessageContent | null {
  if (!message) {
    return null;
  }
  const inner = message.ephemeralMessage?.message;
  if (inner) {
    return inner as MessageContent;
  }
  return message;
}

/** Teks utama pesan (tanpa konteks reply). */
export function extractPlainText(
  message: WAMessage["message"]
): string {
  const m = unwrapMessage(message);
  if (!m) {
    return "";
  }
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.listResponseMessage?.singleSelectReply?.selectedRowId ??
    ""
  ).trim();
}

function contextInfoFrom(message: MessageContent | null) {
  if (!message) {
    return undefined;
  }
  return (
    message.extendedTextMessage?.contextInfo ??
    message.imageMessage?.contextInfo ??
    message.videoMessage?.contextInfo ??
    message.documentMessage?.contextInfo ??
    message.audioMessage?.contextInfo ??
    message.stickerMessage?.contextInfo ??
    message.buttonsResponseMessage?.contextInfo ??
    message.listResponseMessage?.contextInfo
  );
}

/** Teks pesan yang di-quote (reply/swipe reply di WhatsApp). */
export function extractQuotedText(
  message: WAMessage["message"]
): string | null {
  const m = unwrapMessage(message);
  const quoted = contextInfoFrom(m)?.quotedMessage;
  if (!quoted) {
    return null;
  }
  const text = extractPlainText(quoted as MessageContent);
  return text.length > 0 ? text : null;
}

const QUOTE_MAX = 1500;

/**
 * Teks untuk AI — sertakan pesan yang di-reply supaya agent paham konteks
 * (alert sistem, pesan VANDOR sebelumnya, dll.).
 */
export function extractTextWithReplyContext(
  message: WAMessage["message"]
): string {
  const body = extractPlainText(message);
  const quoted = extractQuotedText(message);
  if (!quoted) {
    return body;
  }

  let preview = quoted.trim();
  if (preview.length > QUOTE_MAX) {
    preview = `${preview.slice(0, QUOTE_MAX)}…`;
  }

  const quotedBlock = preview
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");

  if (!body) {
    return `[User membalas (reply) pesan WhatsApp berikut — tanpa teks tambahan]\n${quotedBlock}`;
  }

  return `[User membalas (reply) pesan WhatsApp berikut]\n${quotedBlock}\n\n[Balasan user]\n${body}`;
}
