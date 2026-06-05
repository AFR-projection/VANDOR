import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const GATE_COOKIE_NAME = "vandor_gate";
export const DEVICE_COOKIE_NAME = "vandor_device";
export const GATE_PIN_LENGTH = 4;
export const GATE_MAX_ATTEMPTS = 3;
export const GATE_BAN_MS = 60 * 60 * 1000;
export const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Default 30 days — session stays until logout or expiry. */
const GATE_TTL_MS =
  Number(process.env.VANDOR_GATE_TTL_SECONDS ?? "2592000") * 1000;

type GatePayload = {
  exp: number;
  sid: string;
  dev?: string;
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for VANDOR gate");
  }
  return secret;
}

export function getClientIp(request: NextRequest | Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "local";
}

export function getDeviceId(request: NextRequest | Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE_NAME}=([^;]+)`)
  );
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  const req = request as NextRequest & { cookies?: { get?: Function } };
  if (typeof req.cookies?.get === "function") {
    const v = req.cookies.get(DEVICE_COOKIE_NAME);
    if (v?.value) return v.value;
  }
  return null;
}

export function getGateCookieValue(
  request: NextRequest | Request
): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${GATE_COOKIE_NAME}=([^;]+)`)
  );
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  const req = request as NextRequest & { cookies?: { get?: Function } };
  if (typeof req.cookies?.get === "function") {
    const v = req.cookies.get(GATE_COOKIE_NAME);
    if (v?.value) return v.value;
  }
  return undefined;
}

/**
 * Stable per-browser identifier. Combines IP with the device cookie so two
 * browsers on the same network (or the same dev machine) are tracked
 * independently for rate-limiting / session purposes.
 */
export function getClientId(request: NextRequest | Request): string {
  const ip = getClientIp(request);
  const dev = getDeviceId(request);
  return dev ? `${ip}:${dev}` : ip;
}

export function generateDeviceId(): string {
  return randomBytes(16).toString("base64url");
}

export function generateSessionId(): string {
  return randomBytes(24).toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest("base64url");
}

function encodePayload(payload: GatePayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decodeToken(token: string): GatePayload | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) {
    return null;
  }
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    return JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as GatePayload;
  } catch {
    return null;
  }
}

export function createGateToken(sid: string, deviceId: string | null): string {
  return encodePayload({
    exp: Date.now() + GATE_TTL_MS,
    sid,
    dev: deviceId ?? undefined,
  });
}

export function verifyGateToken(token: string | undefined): boolean {
  const payload = readGateToken(token);
  return Boolean(payload?.sid);
}

/** Decode + signature + expiry check. Returns payload or null. */
export function readGateToken(token: string | undefined): GatePayload | null {
  if (!token) {
    return null;
  }
  const payload = decodeToken(token);
  if (!payload?.sid) {
    return null;
  }
  if (payload.exp < Date.now()) {
    return null;
  }
  return payload;
}

export function verifyNumpadPin(pin: string): boolean {
  const expected = process.env.VANDOR_NUMPAD_PIN;
  if (!expected) {
    return false;
  }
  if (!/^\d+$/.test(pin) || pin.length !== GATE_PIN_LENGTH) {
    return false;
  }
  if (expected.length !== pin.length) {
    return false;
  }
  try {
    const a = Buffer.from(pin);
    const b = Buffer.from(expected);
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isGateConfigured(): boolean {
  return Boolean(process.env.VANDOR_NUMPAD_PIN && process.env.AUTH_SECRET);
}

export function hasOwnerCredentials(): boolean {
  return Boolean(
    process.env.VANDOR_OWNER_EMAIL && process.env.VANDOR_OWNER_PASSWORD
  );
}

export function getOwnerCredentials(): {
  email: string;
  password: string;
} | null {
  const email = process.env.VANDOR_OWNER_EMAIL;
  const password = process.env.VANDOR_OWNER_PASSWORD;
  if (!email || !password) {
    return null;
  }
  return { email, password };
}
