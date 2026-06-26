import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put as vercelPut } from "@vercel/blob";
import { getAppUrl } from "@/lib/app-url";
import {
  hasR2Storage,
  hasVercelBlob,
  isServerlessRuntime,
  storageSetupHint,
} from "@/lib/storage/config";
import { chatFileServeUrl } from "@/lib/files/chat-file-url";
import { putR2File } from "@/lib/storage/r2";

export type StoredFile = {
  url: string;
  pathname: string;
  backend: "vercel-blob" | "r2" | "local";
};

export type PutOptions = {
  contentType?: string;
  /** Append random suffix to filename (default true). */
  addRandomSuffix?: boolean;
};

const LOCAL_DIR = path.join(process.cwd(), "public", "storage");

export class StorageNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "Storage belum dikonfigurasi.");
    this.name = "StorageNotConfiguredError";
  }
}

function toBuffer(data: Buffer | ArrayBuffer | Uint8Array): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(new Uint8Array(data));
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function publicUrl(pathname: string): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return `${getAppUrl()}${pathname}`;
  }
  return pathname;
}

/**
 * Store a binary blob.
 * Priority: Vercel Blob → Cloudflare R2 → local public/storage (dev only).
 */
export async function putFile(
  filename: string,
  data: Buffer | ArrayBuffer | Uint8Array,
  options: PutOptions = {}
): Promise<StoredFile> {
  const contentType = options.contentType ?? "application/octet-stream";
  const addSuffix = options.addRandomSuffix !== false;
  const buf = toBuffer(data);
  const runtime = await import("@/lib/settings/integration-runtime").then(
    (m) => m.getIntegrationRuntimeConfig()
  );
  const blobToken = runtime.vercelBlob.token;

  if (blobToken) {
    process.env.BLOB_READ_WRITE_TOKEN = blobToken;
  }

  if (await hasVercelBlob()) {
    const result = await vercelPut(filename, buf, {
      access: "public",
      contentType,
      addRandomSuffix: addSuffix,
    });
    return {
      url: result.url,
      pathname: result.pathname,
      backend: "vercel-blob",
    };
  }

  if (await hasR2Storage()) {
    const result = await putR2File(filename, buf, contentType, addSuffix);
    return {
      url: chatFileServeUrl(result.pathname),
      pathname: result.pathname,
      backend: "r2",
    };
  }

  if (isServerlessRuntime()) {
    throw new StorageNotConfiguredError(await storageSetupHint());
  }

  await mkdir(LOCAL_DIR, { recursive: true });
  const ext = path.extname(filename);
  const stem = sanitize(path.basename(filename, ext)) || "file";
  const suffix = addSuffix ? `-${randomBytes(6).toString("hex")}` : "";
  const finalName = `${stem}${suffix}${ext}`;
  const fullPath = path.join(LOCAL_DIR, finalName);
  await writeFile(fullPath, buf);

  const pathname = `/storage/${finalName}`;
  return {
    url: publicUrl(pathname),
    pathname,
    backend: "local",
  };
}
