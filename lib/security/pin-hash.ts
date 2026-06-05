import "server-only";

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1 } as const;
const KEY_LEN = 32;

export function hashNumpadPin(pin: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

export function verifyNumpadPinHash(pin: string, stored: string): boolean {
  if (!stored.startsWith("scrypt:")) {
    return false;
  }
  const parts = stored.split(":");
  if (parts.length !== 3) {
    return false;
  }
  const salt = Buffer.from(parts[1], "base64url");
  const expected = Buffer.from(parts[2], "base64url");
  const actual = scryptSync(pin, salt, KEY_LEN, SCRYPT_PARAMS);
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
