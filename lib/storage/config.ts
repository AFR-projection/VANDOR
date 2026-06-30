import "server-only";

import { getIntegrationRuntimeConfig } from "@/lib/settings/integration-runtime";

export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.NETLIFY)
  );
}

/** @deprecated Prefer async hasVercelBlob() */
export function hasVercelBlobEnv(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

/** @deprecated Prefer async hasR2Storage() */
export function hasR2StorageEnv(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim()
  );
}

export async function hasVercelBlob(): Promise<boolean> {
  const cfg = await getIntegrationRuntimeConfig();
  return cfg.vercelBlob.configured;
}

export async function hasR2Storage(): Promise<boolean> {
  const cfg = await getIntegrationRuntimeConfig();
  return cfg.r2.configured;
}

export async function storageSetupHint(): Promise<string> {
  if (await hasVercelBlob()) {
    return "Vercel Blob aktif.";
  }
  if (await hasR2Storage()) {
    return "Cloudflare R2 aktif.";
  }
  if (isServerlessRuntime()) {
    return "Di Vercel/serverless wajib set Vercel Blob atau Cloudflare R2 di Pengaturan → API & integrasi.";
  }
  return "File disimpan di public/storage (development).";
}
