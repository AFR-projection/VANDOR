import { NextResponse } from "next/server";

import { signIn } from "@/app/(auth)/auth";

import { useSecureCookies } from "@/lib/constants";

import { ensureOwnerUser } from "@/lib/db/ensure-owner";
import {
  clearAttempts,
  createGateToken,
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_COOKIE_NAME,
  GATE_PIN_LENGTH,
  generateDeviceId,
  generateSessionId,
  getClientId,
  getClientIp,
  getDeviceId,
  getLockoutStatus,
  getOwnerCredentials,
  isGateConfigured,
  recordFailedAttempt,
  recordLoginHistory,
  registerSession,
} from "@/lib/security/gate";

import {
  buildGateLoginSuccessJsonResponse,
  buildGateLoginSuccessResponse,
} from "@/lib/security/gate-verify-response";
import { lookupGeoIp } from "@/lib/security/geo-ip";

import { verifyNumpadPinForGate } from "@/lib/security/pin-gate";

const GATE_COOKIE_MAX_AGE = Number(
  process.env.VANDOR_GATE_TTL_SECONDS ?? "2592000"
);

export async function POST(request: Request) {
  if (!isGateConfigured()) {
    return NextResponse.json(
      { error: "Gate not configured. Set VANDOR_NUMPAD_PIN in .env.local" },

      { status: 503 }
    );
  }

  const ip = getClientIp(request);

  const existingDevice = getDeviceId(request);

  const deviceId = existingDevice ?? generateDeviceId();

  const clientId = existingDevice ? getClientId(request) : `${ip}:${deviceId}`;

  const userAgent = request.headers.get("user-agent");

  const lockout = await getLockoutStatus(clientId);

  if (lockout.locked) {
    return NextResponse.json(
      {
        error: "Perangkat ini diblokir karena terlalu banyak percobaan",

        locked: true,

        lockedUntil: lockout.lockedUntil,

        attemptsLeft: 0,
      },

      { status: 429 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  let pin = "";

  let redirectPath = "/";

  if (contentType.includes("application/json")) {
    let body: { pin?: string; redirectUrl?: string };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    pin = String(body.pin ?? "");

    redirectPath =
      typeof body.redirectUrl === "string" && body.redirectUrl.startsWith("/")
        ? body.redirectUrl
        : "/";
  } else {
    const form = await request.formData();

    pin = String(form.get("pin") ?? "");

    const rawRedirect = String(form.get("redirectUrl") ?? "/");

    redirectPath =
      rawRedirect.startsWith("/") && !rawRedirect.startsWith("//")
        ? rawRedirect
        : "/";
  }

  if (!/^\d+$/.test(pin) || pin.length !== GATE_PIN_LENGTH) {
    return NextResponse.json(
      {
        error: `PIN harus ${GATE_PIN_LENGTH} digit angka`,

        attemptsLeft: lockout.attemptsLeft,
      },

      { status: 400 }
    );
  }

  if (!(await verifyNumpadPinForGate(pin))) {
    const next = await recordFailedAttempt(clientId);

    if (next.locked) {
      const failRes = NextResponse.json(
        {
          error: "3x salah. Perangkat ini diblokir selama 1 jam.",

          locked: true,

          lockedUntil: next.lockedUntil,

          attemptsLeft: 0,
        },

        { status: 429 }
      );

      if (!existingDevice) {
        failRes.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
          httpOnly: true,

          secure: useSecureCookies(),

          sameSite: "lax",

          path: "/",

          maxAge: DEVICE_COOKIE_MAX_AGE,
        });
      }

      return failRes;
    }

    const failRes = NextResponse.json(
      {
        error: `PIN salah. Sisa ${next.attemptsLeft} percobaan.`,

        attemptsLeft: next.attemptsLeft,
      },

      { status: 401 }
    );

    if (!existingDevice) {
      failRes.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
        httpOnly: true,

        secure: useSecureCookies(),

        sameSite: "lax",

        path: "/",

        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }

    return failRes;
  }

  await clearAttempts(clientId);

  const sid = generateSessionId();

  const geo = await lookupGeoIp(ip);

  await registerSession({
    sid,

    deviceId,

    ip,

    userAgent,

    locationLabel: geo.locationLabel,
  });

  await recordLoginHistory({
    sid,

    ip,

    userAgent,

    locationLabel: geo.locationLabel,

    city: geo.city,

    region: geo.region,

    country: geo.country,
  });

  const token = createGateToken(sid, deviceId);

  const owner = getOwnerCredentials();

  if (owner) {
    try {
      await ensureOwnerUser();

      await signIn("credentials", {
        email: owner.email,

        password: owner.password,

        redirect: false,
      });
    } catch {
      return NextResponse.json(
        { error: "Login owner gagal. Cek VANDOR_OWNER_EMAIL/PASSWORD." },

        { status: 500 }
      );
    }
  }

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  if (contentType.includes("application/json")) {
    return buildGateLoginSuccessJsonResponse(
      redirectPath,
      token,
      deviceId,
      GATE_COOKIE_MAX_AGE
    );
  }

  const target = new URL(`${base}${redirectPath}`, request.url);

  return buildGateLoginSuccessResponse(
    target,

    token,

    deviceId,

    GATE_COOKIE_MAX_AGE
  );
}
