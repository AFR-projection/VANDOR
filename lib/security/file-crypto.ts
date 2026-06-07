import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";

export type EncryptedPayload = {
  ciphertext: Buffer;
  iv: string;
  tag: string;
};

function encryptionKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required for file encryption");
  }
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM encrypt a file buffer before R2 upload. */
export function encryptBuffer(plaintext: Buffer): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

/** Decrypt a file buffer retrieved from R2. Only call on user download request. */
export function decryptBuffer(
  ciphertext: Buffer,
  ivB64: string,
  tagB64: string
): Buffer {
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const decipher = createDecipheriv(ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
