import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/constants";
import { DEVICE_COOKIE_NAME, GATE_COOKIE_NAME } from "@/lib/security/gate-edge";

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

async function attachGateSessionCookies(
  response: NextResponse,
  gateToken: string,
  deviceId: string,
  gateCookieMaxAge: number
): Promise<NextResponse> {
  const secure = shouldUseSecureCookies();
  const cookieOpts = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
  };

  response.cookies.set(GATE_COOKIE_NAME, gateToken, {
    ...cookieOpts,
    maxAge: gateCookieMaxAge,
  });
  response.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
    ...cookieOpts,
    maxAge: 60 * 60 * 24 * 365,
  });

  const store = await cookies();
  for (const c of store.getAll()) {
    if (!c.name.includes("authjs") && !c.name.includes("next-auth")) {
      continue;
    }
    response.cookies.set(c.name, c.value, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: AUTH_COOKIE_MAX_AGE,
    });
  }

  return response;
}

/** Form POST / navigasi penuh — redirect + cookie. */
export async function buildGateLoginSuccessResponse(
  target: URL,
  gateToken: string,
  deviceId: string,
  gateCookieMaxAge: number
): Promise<NextResponse> {
  const response = NextResponse.redirect(target);
  return attachGateSessionCookies(
    response,
    gateToken,
    deviceId,
    gateCookieMaxAge
  );
}

/**
 * fetch() dari halaman /gate tidak menerapkan Set-Cookie pada redirect 302.
 * Kembalikan JSON 200 + cookie agar browser menyimpan sesi login.
 */
export async function buildGateLoginSuccessJsonResponse(
  redirectPath: string,
  gateToken: string,
  deviceId: string,
  gateCookieMaxAge: number
): Promise<NextResponse> {
  const response = NextResponse.json({
    ok: true,
    redirectUrl: redirectPath,
  });
  return attachGateSessionCookies(
    response,
    gateToken,
    deviceId,
    gateCookieMaxAge
  );
}
