import { NextResponse } from "next/server";
import { signIn } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";
import { ensureOwnerUser } from "@/lib/db/ensure-owner";
import {
  clearAttempts,
  createGateToken,
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_COOKIE_NAME,
  GATE_COOKIE_NAME,
  GATE_MAX_ATTEMPTS,
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
  rotateActiveSession,
} from "@/lib/security/gate";
import { verifyNumpadPinForGate } from "@/lib/security/pin-gate";

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

  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const pin = String(body.pin ?? "");
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
          secure: !isDevelopmentEnvironment,
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
        secure: !isDevelopmentEnvironment,
        sameSite: "lax",
        path: "/",
        maxAge: DEVICE_COOKIE_MAX_AGE,
      });
    }
    return failRes;
  }

  await clearAttempts(clientId);

  const sid = generateSessionId();
  await rotateActiveSession(sid, clientId, ip);

  const token = createGateToken(ip, sid, deviceId);

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

  const response = NextResponse.json({
    ok: true,
    attemptsLeft: GATE_MAX_ATTEMPTS,
  });
  response.cookies.set(GATE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: !isDevelopmentEnvironment,
    sameSite: "lax",
    path: "/",
    maxAge: Number(process.env.VANDOR_GATE_TTL_SECONDS ?? "3600"),
  });
  if (!existingDevice) {
    response.cookies.set(DEVICE_COOKIE_NAME, deviceId, {
      httpOnly: true,
      secure: !isDevelopmentEnvironment,
      sameSite: "lax",
      path: "/",
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }

  return response;
}
