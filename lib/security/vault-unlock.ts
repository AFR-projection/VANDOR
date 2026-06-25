import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isDevelopmentEnvironment } from "@/lib/constants";
import { isPinConfiguredForGate } from "@/lib/security/pin-gate";
import {
  getClientId,
  getGateCookieValue,
  readGateToken,
  verifyGateToken,
} from "./gate-edge";

export const VAULT_UNLOCK_COOKIE_NAME = "vandor_vault_unlock";
/** Step-up PIN valid for 10 minutes after confirmation. */
export const VAULT_UNLOCK_TTL_MS = 10 * 60 * 1000;

type VaultUnlockPayload = {
  exp: number;
  cid: string;
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required for vault unlock");
  }
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest("base64url");
}

function encodePayload(payload: VaultUnlockPayload): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

function decodeToken(token: string): VaultUnlockPayload | null {
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
    ) as VaultUnlockPayload;
  } catch {
    return null;
  }
}

export function createVaultUnlockToken(clientId: string): string {
  return encodePayload({
    exp: Date.now() + VAULT_UNLOCK_TTL_MS,
    cid: clientId,
  });
}

export function getVaultUnlockCookieValue(
  request: Request
): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${VAULT_UNLOCK_COOKIE_NAME}=([^;]+)`)
  );
  if (match?.[1]) {
    return decodeURIComponent(match[1]);
  }
  return undefined;
}

export function isVaultUnlocked(request: Request): boolean {
  const token = getVaultUnlockCookieValue(request);
  const payload = decodeToken(token ?? "");
  if (!payload?.cid) {
    return false;
  }
  if (payload.exp < Date.now()) {
    return false;
  }
  const clientId = getClientId(request);
  return payload.cid === clientId;
}

export function vaultUnlockCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(VAULT_UNLOCK_TTL_MS / 1000),
  };
}

export function setVaultUnlockCookie(
  response: NextResponse,
  clientId: string,
  secure: boolean
): NextResponse {
  response.cookies.set(
    VAULT_UNLOCK_COOKIE_NAME,
    createVaultUnlockToken(clientId),
    vaultUnlockCookieOptions(secure)
  );
  return response;
}

/** Returns null if vault decrypt/download is allowed; otherwise 401 JSON. */
export async function requireVaultUnlock(
  request: Request
): Promise<NextResponse | null> {
  const pinConfigured = await isPinConfiguredForGate();
  if (!pinConfigured) {
    return null;
  }

  const gateToken = getGateCookieValue(request);
  if (!verifyGateToken(gateToken) || !readGateToken(gateToken)?.sid) {
    return NextResponse.json(
      {
        error: "Login required",
        requiresPin: true,
        reason: "gate_required",
      },
      { status: 401 }
    );
  }

  if (isVaultUnlocked(request)) {
    return null;
  }

  return NextResponse.json(
    {
      error: "Konfirmasi PIN diperlukan untuk mengakses berangkas",
      requiresPin: true,
      reason: "vault_pin_required",
    },
    { status: 401 }
  );
}

export function vaultUnlockSecureFlag(): boolean {
  return !isDevelopmentEnvironment;
}
