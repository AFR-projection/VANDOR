import "server-only";

import { AwsClient } from "aws4fetch";
import { randomBytes } from "node:crypto";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function publicBaseUrl(): string {
  const custom = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (custom) {
    return custom;
  }
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !bucket) {
    throw new Error("R2_PUBLIC_URL or R2_ACCOUNT_ID+R2_BUCKET_NAME required");
  }
  return `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
}

/**
 * Upload to Cloudflare R2 (S3-compatible). Requires R2_* env vars.
 * Set R2_PUBLIC_URL to your r2.dev or custom domain for browser downloads.
 */
export async function putR2File(
  filename: string,
  data: Buffer,
  contentType: string,
  addRandomSuffix = true
): Promise<{ url: string; pathname: string }> {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 storage is not fully configured");
  }

  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf("."))
    : "";
  const stem = sanitize(filename.replace(ext, "")) || "file";
  const suffix = addRandomSuffix ? `-${randomBytes(6).toString("hex")}` : "";
  const key = `vandor/${stem}${suffix}${ext}`;

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
  const client = new AwsClient({ accessKeyId, secretAccessKey });

  const res = await client.fetch(endpoint, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: { "Content-Type": contentType },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const url = `${publicBaseUrl()}/${key}`;
  return { url, pathname: key };
}
