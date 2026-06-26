import "server-only";

import { NextResponse } from "next/server";
import { touchSession } from "./gate";
import {
  shouldTouchGateSession,
  isSessionActiveCached,
} from "./gate-session-cache";
import {
  DEVICE_COOKIE_NAME,
  GATE_COOKIE_NAME,
  getClientId,
  getClientIp,
  getGateCookieValue,
  isGateConfigured,
  readGateToken,
  verifyGateToken,
} from "./gate-edge";

export type AccessDenyReason = "gate_required" | "session_revoked";

export type ClientAccessSnapshot = {
  ip: string;
  clientId: string;
  gateConfigured: boolean;
  gateValid: boolean;
  sessionRevoked: boolean;
  requiresPin: boolean;
  sessionId: string | null;
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
  response.cookies.set(DEVICE_COOKIE_NAME, "", gateCookieOptions(secure));
  return response;
}

export async function getClientAccessSnapshot(
  request: Request
): Promise<ClientAccessSnapshot> {
  const ip = getClientIp(request);
  const clientId = getClientId(request);
  const gateConfigured = isGateConfigured();

  const token = getGateCookieValue(request);
  const payload = readGateToken(token);
  const gateValid =
    gateConfigured && verifyGateToken(token) && Boolean(payload);

  let sessionRevoked = false;
  if (gateConfigured && gateValid && payload?.sid) {
    sessionRevoked = !(await isSessionActiveCached(payload.sid));
  }

  const requiresPin = gateConfigured && (!gateValid || sessionRevoked);

  if (gateValid && payload?.sid && !sessionRevoked) {
    if (shouldTouchGateSession(payload.sid)) {
      void touchSession(payload.sid);
    }
  }

  return {
    ip,
    clientId,
    gateConfigured,
    gateValid,
    sessionRevoked,
    requiresPin,
    sessionId: payload?.sid ?? null,
  };
}

export async function accessDeniedResponse(
  snapshot: ClientAccessSnapshot,
  opts?: { secureCookie?: boolean }
): Promise<NextResponse> {
  const secure = opts?.secureCookie ?? process.env.NODE_ENV === "production";

  let reason: AccessDenyReason = "gate_required";
  if (snapshot.sessionRevoked) {
    reason = "session_revoked";
  } else if (!snapshot.gateValid) {
    reason = "gate_required";
  }

  return clearGateCookieOnResponse(
    NextResponse.json(
      {
        error:
          reason === "session_revoked" ? "Session revoked" : "Login required",
        reason,
        ip: snapshot.ip,
        requiresPin: true,
      },
      { status: 401 }
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
