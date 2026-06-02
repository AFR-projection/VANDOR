import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { isDevelopmentEnvironment } from "./lib/constants";
import {
  clearGateCookieOnResponse,
  getClientAccessSnapshot,
} from "./lib/security/client-access";
import {
  hasOwnerCredentials,
  isGateConfigured,
} from "./lib/security/gate-edge";

const PUBLIC_PATHS = ["/gate", "/api/gate", "/api/auth"];
const ALLOWLIST_BYPASS_PATHS = ["/denied", "/api/whoami"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

function isAllowlistBypassPath(pathname: string): boolean {
  return ALLOWLIST_BYPASS_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  const secureCookie = !isDevelopmentEnvironment;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  const snapshot = await getClientAccessSnapshot(request);

  // ── Layer 1: IP allowlist (re-checked every request) ─────────────
  if (snapshot.ipAllowlistEnabled && !isAllowlistBypassPath(pathname)) {
    if (!snapshot.ipAllowed) {
      if (pathname.startsWith("/api/")) {
        return clearGateCookieOnResponse(
          NextResponse.json(
            { error: "IP not allowed", ip: snapshot.ip, requiresPin: true },
            { status: 403 }
          ),
          secureCookie
        );
      }
      return clearGateCookieOnResponse(
        NextResponse.redirect(new URL(`${base}/denied`, request.url)),
        secureCookie
      );
    }
  }

  if (pathname === "/register" || pathname.startsWith("/register/")) {
    return NextResponse.redirect(new URL(`${base}/gate`, request.url));
  }
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return NextResponse.redirect(new URL(`${base}/gate`, request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // ── Layer 2: Gate PIN bound to current IP (realtime) ───────────────
  if (isGateConfigured()) {
    if (snapshot.requiresPin) {
      const reason = !snapshot.ipAllowed
        ? "ip"
        : snapshot.ipMismatch
          ? "ip_changed"
          : snapshot.sessionRevoked
            ? "revoked"
            : "expired";

      if (pathname.startsWith("/api/")) {
        return clearGateCookieOnResponse(
          NextResponse.json(
            {
              error: "Gate required",
              reason,
              requiresPin: true,
              ipMismatch: snapshot.ipMismatch,
            },
            { status: 401 }
          ),
          secureCookie
        );
      }

      return clearGateCookieOnResponse(
        NextResponse.redirect(
          new URL(`${base}/gate?reason=${reason}`, request.url)
        ),
        secureCookie
      );
    }
  }

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });

  if (!token) {
    if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (hasOwnerCredentials()) {
      const redirectUrl = encodeURIComponent(pathname);
      return NextResponse.redirect(
        new URL(`${base}/gate?redirectUrl=${redirectUrl}`, request.url)
      );
    }
    const redirectUrl = encodeURIComponent(pathname);
    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/chat/:id",
    "/gate",
    "/settings",
    "/settings/:path*",
    "/api/:path*",
    "/login",
    "/register",
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
