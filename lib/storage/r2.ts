import "server-only";

import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function awsClient() {
  const cfg = r2Config();
  if (!cfg) {
    throw new Error("R2 storage is not fully configured");
  }
  return {
    client: new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    }),
    accountId: cfg.accountId,
    bucket: cfg.bucket,
  };
}

function objectUrl(key: string): string {
  const cfg = r2Config();
  if (!cfg) {
    throw new Error("R2 storage is not fully configured");
  }
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`;
}

function publicBaseUrl(): string {
  const custom = process.env.R2_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (custom) {
    return custom;
  }
  const cfg = r2Config();
  if (!cfg) {
    throw new Error("R2_PUBLIC_URL or R2_ACCOUNT_ID+R2_BUCKET_NAME required");
  }
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
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
  const ext = filename.includes(".")
    ? filename.slice(filename.lastIndexOf("."))
    : "";
  const stem = sanitize(filename.replace(ext, "")) || "file";
  const suffix = addRandomSuffix ? `-${randomBytes(6).toString("hex")}` : "";
  const key = `vandor/${stem}${suffix}${ext}`;

  await putR2Object(key, data, contentType);

  const url = `${publicBaseUrl()}/${key}`;
  return { url, pathname: key };
}

/** Upload raw bytes to a specific R2 object key (for encrypted vault blobs). */
export async function putR2Object(
  key: string,
  data: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  const { client, accountId, bucket } = awsClient();
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;

  const res = await client.fetch(endpoint, {
    method: "PUT",
    body: new Uint8Array(data),
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.byteLength),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${text.slice(0, 200)}`);
  }
}

/** Fetch object bytes from R2 by key. */
export async function getR2Object(key: string): Promise<Buffer> {
  const { client } = awsClient();
  const res = await client.fetch(objectUrl(key), { method: "GET" });
  if (!res.ok) {
    throw new Error(`R2 get failed (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Delete object from R2. */
export async function deleteR2Object(key: string): Promise<void> {
  const { client } = awsClient();
  const res = await client.fetch(objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status})`);
  }
}
