import "server-only";

import { put as vercelPut } from "@vercel/blob";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAppUrl } from "@/lib/app-url";

export type StoredFile = {
  url: string;
  pathname: string;
  backend: "vercel-blob" | "local";
};

export type PutOptions = {
  contentType?: string;
  /** Append random suffix to filename (default true). */
  addRandomSuffix?: boolean;
};

const LOCAL_DIR = path.join(process.cwd(), "public", "storage");

function hasVercelBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
 * Store a binary blob. Uses Vercel Blob if `BLOB_READ_WRITE_TOKEN` is set,
 * otherwise writes to `./public/storage` so the file is served as a static
 * asset by Next.js (perfect for local dev / self-hosted single-server).
 */
export async function putFile(
  filename: string,
  data: Buffer | ArrayBuffer | Uint8Array,
  options: PutOptions = {}
): Promise<StoredFile> {
  const contentType = options.contentType ?? "application/octet-stream";
  const addSuffix = options.addRandomSuffix !== false;

  if (hasVercelBlob()) {
    const buf = toBuffer(data);
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

  await mkdir(LOCAL_DIR, { recursive: true });
  const ext = path.extname(filename);
  const stem = sanitize(path.basename(filename, ext)) || "file";
  const suffix = addSuffix ? `-${randomBytes(6).toString("hex")}` : "";
  const finalName = `${stem}${suffix}${ext}`;
  const fullPath = path.join(LOCAL_DIR, finalName);
  await writeFile(fullPath, toBuffer(data));

  const pathname = `/storage/${finalName}`;
  return {
    url: publicUrl(pathname),
    pathname,
    backend: "local",
  };
}
