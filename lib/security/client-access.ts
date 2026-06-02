import "server-only";

import { NextResponse } from "next/server";
import {
  GATE_COOKIE_NAME,
  getClientId,
  getClientIp,
  getGateCookieValue,
  isGateConfigured,
  readGateToken,
  verifyGateToken,
} from "./gate-edge";
import { getActiveSessionId } from "./gate";
import { hasIpAllowlist, isIpAllowed } from "./ip-allowlist";

export type AccessDenyReason =
  | "ip_denied"
  | "gate_required"
  | "gate_ip_mismatch"
  | "session_revoked";

export type ClientAccessSnapshot = {
  ip: string;
  clientId: string;
  ipAllowlistEnabled: boolean;
  ipAllowed: boolean;
  gateConfigured: boolean;
  gateValid: boolean;
  ipMismatch: boolean;
  sessionRevoked: boolean;
  requiresPin: boolean;
};

function gateCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}

export function clearGateCookieOnResponse(
  response: NextResponse,
  secure: boolean
): NextResponse {
  response.cookies.set(GATE_COOKIE_NAME, "", gateCookieOptions(secure));
  return response;
}

export async function getClientAccessSnapshot(
  request: Request
): Promise<ClientAccessSnapshot> {
  const ip = getClientIp(request);
  const clientId = getClientId(request);
  const ipAllowlistEnabled = hasIpAllowlist();
  const ipAllowed = isIpAllowed(ip);
  const gateConfigured = isGateConfigured();

  const token = getGateCookieValue(request);
  const payload = readGateToken(token);
  const gateValid =
    gateConfigured && verifyGateToken(token, ip) && Boolean(payload);

  const ipMismatch = Boolean(
    gateConfigured && payload && payload.ip !== ip
  );

  let sessionRevoked = false;
  if (gateConfigured && payload?.sid) {
    const activeSid = await getActiveSessionId();
    if (activeSid && payload.sid !== activeSid) {
      sessionRevoked = true;
    }
  }

  const requiresPin =
    !ipAllowed ||
    (gateConfigured &&
      (!gateValid || ipMismatch || sessionRevoked));

  return {
    ip,
    clientId,
    ipAllowlistEnabled,
    ipAllowed,
    gateConfigured,
    gateValid,
    ipMismatch,
    sessionRevoked,
    requiresPin,
  };
}

export async function accessDeniedResponse(
  snapshot: ClientAccessSnapshot,
  opts?: { secureCookie?: boolean }
): Promise<NextResponse> {
  const secure = opts?.secureCookie ?? process.env.NODE_ENV === "production";

  let reason: AccessDenyReason = "gate_required";
  if (!snapshot.ipAllowed) {
    reason = "ip_denied";
  } else if (snapshot.ipMismatch) {
    reason = "gate_ip_mismatch";
  } else if (snapshot.sessionRevoked) {
    reason = "session_revoked";
  } else if (!snapshot.gateValid) {
    reason = "gate_required";
  }

  return clearGateCookieOnResponse(
    NextResponse.json(
      {
        error:
          reason === "ip_denied"
            ? "IP not allowed"
            : reason === "gate_ip_mismatch"
              ? "IP changed — PIN required again"
              : reason === "session_revoked"
                ? "Session revoked"
                : "Gate required",
        reason,
        ip: snapshot.ip,
        requiresPin: true,
      },
      { status: reason === "ip_denied" ? 403 : 401 }
    ),
    secure
  );
}

/** Returns null if access OK, otherwise a JSON error response (gate cookie cleared). */
export async function requireClientAccess(
  request: Request
): Promise<NextResponse | null> {
  const snapshot = await getClientAccessSnapshot(request);
  if (!snapshot.requiresPin) {
    return null;
  }
  return accessDeniedResponse(snapshot);
}
