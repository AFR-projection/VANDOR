import "server-only";

import path from "node:path";

/** Writable directory for Baileys multi-file auth (Vercel only allows /tmp). */
export function getWhatsappAuthDir(): string {
  if (process.env.VERCEL === "1" || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return path.join("/tmp", ".whatsapp-auth");
  }
  return path.join(process.cwd(), ".whatsapp-auth");
}

export function isWhatsappServerlessHost(): boolean {
  return (
    process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
  );
}
