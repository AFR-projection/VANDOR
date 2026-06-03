import { NextResponse } from "next/server";
import {
  DEVICE_COOKIE_NAME,
  GATE_COOKIE_NAME,
  getGateCookieValue,
  readGateToken,
  revokeSession,
} from "@/lib/security/gate";

export async function POST(request: Request) {
  const token = getGateCookieValue(request);
  const payload = readGateToken(token);
  if (payload?.sid) {
    await revokeSession(payload.sid);
  }

  const response = NextResponse.json({ ok: true });
  const clear = { httpOnly: true, path: "/", maxAge: 0 };
  response.cookies.set(GATE_COOKIE_NAME, "", clear);
  response.cookies.set(DEVICE_COOKIE_NAME, "", clear);
  return response;
}
