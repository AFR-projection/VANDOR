import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const V2_PREFIX = "v2.";
// Domain-separation label so the secret-encryption key differs from the
// file-encryption key even though both derive from AUTH_SECRET.
const HKDF_INFO = "vandor:secret:v2";
const HKDF_SALT = "vandor-vault-hkdf";

function rootSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET required for secret encryption");
  }
  return secret;
}

/** HKDF-SHA256 domain-separated key (current scheme). */
function encryptionKeyV2(): Buffer {
  const derived = hkdfSync(
    "sha256",
    Buffer.from(rootSecret()),
    Buffer.from(HKDF_SALT),
    Buffer.from(HKDF_INFO),
    32
  );
  return Buffer.from(derived);
}

/** Legacy single SHA-256 key (read-only, for decrypting old payloads). */
function encryptionKeyLegacy(): Buffer {
  return createHash("sha256").update(rootSecret()).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encryptionKeyV2(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function tryDecrypt(payload: string, key: Buffer): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) {
      return null;
    }
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8"
    );
  } catch {
    return null;
  }
}

export function decryptSecret(payload: string): string | null {
  if (payload.startsWith(V2_PREFIX)) {
    return tryDecrypt(payload.slice(V2_PREFIX.length), encryptionKeyV2());
  }
  // Legacy payload (pre-HKDF): decrypt with old key for backward compat.
  return tryDecrypt(payload, encryptionKeyLegacy());
}

export function maskSecret(value: string, visibleTail = 4): string {
  if (value.length <= visibleTail) {
    return "••••";
  }
  return `••••${value.slice(-visibleTail)}`;
}
