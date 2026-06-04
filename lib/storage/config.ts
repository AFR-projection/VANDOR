import "server-only";

export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.NETLIFY)
  );
}

export function hasVercelBlob(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function hasR2Storage(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim()
  );
}

export function storageSetupHint(): string {
  if (hasVercelBlob()) {
    return "Vercel Blob aktif.";
  }
  if (hasR2Storage()) {
    return "Cloudflare R2 aktif.";
  }
  if (isServerlessRuntime()) {
    return (
      "Di Vercel/serverless wajib set BLOB_READ_WRITE_TOKEN (Vercel Blob) " +
      "atau variabel R2_* (Cloudflare R2). Penyimpanan lokal public/storage tidak tersedia."
    );
  }
  return "File disimpan di public/storage (development).";
}
