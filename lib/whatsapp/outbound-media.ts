import "server-only";

import type { WASocket, WAMessage } from "@whiskeysockets/baileys";

export type WhatsappOutboundAttachment = {
  kind: "image" | "video" | "audio" | "document";
  buffer: Buffer;
  mime: string;
  filename: string;
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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

type PendingAttachment = Omit<WhatsappOutboundAttachment, "buffer"> & {
  sourceUrl: string;
};

function parseAttachmentFromToolOutput(
  output: unknown
): PendingAttachment | null {
  const o = asRecord(output);
  if (!o || o.ok === false) {
    return null;
  }

  const url = typeof o.url === "string" ? o.url : null;
  const kind = typeof o.kind === "string" ? o.kind : null;
  if (!url || !kind) {
    return null;
  }

  const filename =
    (typeof o.filename === "string" && o.filename) ||
    (typeof o.title === "string" && `${o.title.replace(/[^\w.-]+/g, "_")}.pdf`) ||
    "vandor-file";

  if (kind === "image") {
    return {
      kind: "image",
      mime: typeof o.mime === "string" ? o.mime : "image/png",
      filename,
      caption:
        typeof o.prompt === "string" ? o.prompt.slice(0, 200) : undefined,
      sourceUrl: url,
    };
  }

  if (kind === "pdf" || kind === "docx" || kind === "xlsx" || kind === "csv") {
    const mimeMap: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
    };
    return {
      kind: "document",
      mime: mimeMap[kind] ?? "application/octet-stream",
      filename,
      caption: typeof o.title === "string" ? o.title : undefined,
      sourceUrl: url,
    };
  }

  return null;
}

/**
 * Collect outbound attachments from AI SDK tool results.
 */
export async function attachmentsFromToolResults(
  toolResults: Array<{ toolName: string; output: unknown }>
): Promise<WhatsappOutboundAttachment[]> {
  const pending = toolResults
    .map((tr) => parseAttachmentFromToolOutput(tr.output))
    .filter((item): item is PendingAttachment => Boolean(item));

  const resolved: WhatsappOutboundAttachment[] = [];
  for (const item of pending) {
    try {
      const buffer = await fetchBufferFromUrl(item.sourceUrl);
      const { sourceUrl: _unused, ...rest } = item;
      resolved.push({ ...rest, buffer });
    } catch (error) {
      console.warn("[wa] outbound fetch failed:", error);
    }
  }
  return resolved;
}

/**
 * Send generated media back to WhatsApp.
 */
export async function deliverWhatsappOutboundMedia(
  sock: WASocket,
  jid: string,
  attachments: WhatsappOutboundAttachment[],
  quoted?: WAMessage
): Promise<void> {
  for (const file of attachments) {
    const opts = quoted ? { quoted } : undefined;
    if (file.kind === "image") {
      await sock.sendMessage(
        jid,
        {
          image: file.buffer,
          mimetype: file.mime,
          caption: file.caption,
        },
        opts
      );
      continue;
    }

    if (file.kind === "video") {
      await sock.sendMessage(
        jid,
        {
          video: file.buffer,
          mimetype: file.mime,
          fileName: file.filename,
          caption: file.caption,
        },
        opts
      );
      continue;
    }

    if (file.kind === "audio") {
      await sock.sendMessage(
        jid,
        {
          audio: file.buffer,
          mimetype: file.mime,
          fileName: file.filename,
          ptt: false,
        },
        opts
      );
      continue;
    }

    await sock.sendMessage(
      jid,
      {
        document: file.buffer,
        mimetype: file.mime,
        fileName: file.filename,
        caption: file.caption,
      },
      opts
    );
  }
}
