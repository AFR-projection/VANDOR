import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  isChatFileServeUrl,
  isPrivateR2Url,
  r2ChatKeyFromUrl,
} from "@/lib/files/chat-file-url";
import { isVaultOpenUrl, readVaultAttachment } from "@/lib/files/vault-attachment";
import type { ChatMessage } from "@/lib/types";

const LOCAL_STORAGE_DIR = path.join(process.cwd(), "public", "storage");

/** Max bytes we will inline as base64 to avoid blowing up the LLM request. */
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

function isLocalStorageUrl(url: string): boolean {
  if (url.startsWith("/storage/")) return true;
  try {
    const u = new URL(url);
    return (
      (u.hostname === "localhost" ||
        u.hostname === "127.0.0.1" ||
        u.hostname === "[::1]") &&
      u.pathname.startsWith("/storage/")
    );
  } catch {
    return false;
  }
}

async function localFileToDataUrl(
  url: string,
  mime: string
): Promise<string | null> {
  let pathname: string;
  if (url.startsWith("/storage/")) {
    pathname = url;
  } else {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return null;
    }
  }
  const fileName = pathname.replace(/^\/storage\//, "");
  const safe = path.basename(fileName);
  const fullPath = path.join(LOCAL_STORAGE_DIR, safe);
  try {
    const buf = await readFile(fullPath);
    if (buf.byteLength > MAX_INLINE_BYTES) {
      return null;
    }
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Walk through every `file` part of every message and, when its URL is a
 * local /storage/ URL (unreachable from external providers), replace it with
 * an inline data URL so the model receives the actual bytes.
 *
 * Skipped silently when:
 *  - URL is already absolute & reachable (e.g. Vercel Blob)
 *  - File is larger than MAX_INLINE_BYTES
 *  - File can't be read
 */
async function chatFileToDataUrl(
  url: string,
  mime: string
): Promise<string | null> {
  const key = r2ChatKeyFromUrl(url);
  if (!key) {
    return null;
  }
  try {
    const { getR2Object } = await import("@/lib/storage/r2");
    const buf = await getR2Object(key);
    if (buf.byteLength > MAX_INLINE_BYTES) {
      return null;
    }
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function vaultFileToDataUrl(
  userId: string,
  url: string,
  mime: string
): Promise<string | null> {
  const vault = await readVaultAttachment(userId, url);
  if (!vault || vault.data.byteLength > MAX_INLINE_BYTES) {
    return null;
  }
  return `data:${mime};base64,${vault.data.toString("base64")}`;
}

export async function inlineLocalAttachments(
  messages: ChatMessage[],
  userId?: string
): Promise<ChatMessage[]> {
  const transformed = await Promise.all(
    messages.map(async (msg) => {
      const parts = await Promise.all(
        (msg.parts as Array<Record<string, unknown>>).map(async (part) => {
          if (
            part?.type !== "file" ||
            typeof part.url !== "string" ||
            typeof part.mediaType !== "string"
          ) {
            return part;
          }

          if (userId && isVaultOpenUrl(part.url)) {
            const dataUrl = await vaultFileToDataUrl(
              userId,
              part.url,
              part.mediaType
            );
            if (dataUrl) {
              return { ...part, url: dataUrl };
            }
            return part;
          }

          if (
            isPrivateR2Url(part.url) ||
            isChatFileServeUrl(part.url)
          ) {
            const dataUrl = await chatFileToDataUrl(part.url, part.mediaType);
            if (dataUrl) {
              return { ...part, url: dataUrl };
            }
            return part;
          }

          if (!isLocalStorageUrl(part.url)) {
            return part;
          }
          const dataUrl = await localFileToDataUrl(part.url, part.mediaType);
          if (!dataUrl) return part;
          return { ...part, url: dataUrl };
        })
      );
      return { ...msg, parts } as ChatMessage;
    })
  );
  return transformed;
}
