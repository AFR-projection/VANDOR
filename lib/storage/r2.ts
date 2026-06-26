import "server-only";

import { randomBytes } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { getIntegrationRuntimeConfig } from "@/lib/settings/integration-runtime";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

type R2Resolved = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string | null;
};

async function r2Config(): Promise<R2Resolved | null> {
  const cfg = await getIntegrationRuntimeConfig();
  if (
    !cfg.r2.accountId ||
    !cfg.r2.accessKeyId ||
    !cfg.r2.secretAccessKey ||
    !cfg.r2.bucket
  ) {
    return null;
  }
  return {
    accountId: cfg.r2.accountId,
    accessKeyId: cfg.r2.accessKeyId,
    secretAccessKey: cfg.r2.secretAccessKey,
    bucket: cfg.r2.bucket,
    publicUrl: cfg.r2.publicUrl,
  };
}

async function awsClient() {
  const cfg = await r2Config();
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

async function objectUrl(key: string): Promise<string> {
  const cfg = await r2Config();
  if (!cfg) {
    throw new Error("R2 storage is not fully configured");
  }
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`;
}

async function publicBaseUrl(): Promise<string> {
  const cfg = await r2Config();
  if (!cfg) {
    throw new Error("R2 storage is not fully configured");
  }
  const custom = cfg.publicUrl?.replace(/\/$/, "");
  if (custom) {
    return custom;
  }
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
}

/**
 * Upload to Cloudflare R2 (S3-compatible). Requires R2 credentials in UI or env.
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

  const url = `${await publicBaseUrl()}/${key}`;
  return { url, pathname: key };
}

/** Upload raw bytes to a specific R2 object key (for encrypted vault blobs). */
export async function putR2Object(
  key: string,
  data: Buffer,
  contentType = "application/octet-stream"
): Promise<void> {
  const { client, accountId, bucket } = await awsClient();
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
  const { client } = await awsClient();
  const res = await client.fetch(await objectUrl(key), { method: "GET" });
  if (!res.ok) {
    throw new Error(`R2 get failed (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/** Delete object from R2. */
export async function deleteR2Object(key: string): Promise<void> {
  const { client } = await awsClient();
  const res = await client.fetch(await objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status})`);
  }
}
