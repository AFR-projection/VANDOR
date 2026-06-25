import { NextResponse } from "next/server";
import { z } from "zod";
import { getLockoutStatus, recordFailedAttempt } from "@/lib/security/gate";
import {
  GATE_PIN_LENGTH,
  getClientId,
  isGateConfigured,
} from "@/lib/security/gate-edge";
import { verifyNumpadPinForGate } from "@/lib/security/pin-gate";
import {
  setVaultUnlockCookie,
  vaultUnlockSecureFlag,
} from "@/lib/security/vault-unlock";

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, `PIN harus ${GATE_PIN_LENGTH} digit`),
  scope: z.enum(["vault"]).default("vault"),
});

/** Step-up PIN confirmation for sensitive actions (vault download/open). */
export async function POST(request: Request) {
  if (!isGateConfigured()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const clientId = getClientId(request);
  const lockout = await getLockoutStatus(clientId);

  if (lockout.locked) {
    return NextResponse.json(
      {
        error: "Perangkat diblokir — terlalu banyak percobaan PIN",
        locked: true,
        lockedUntil: lockout.lockedUntil,
        attemptsLeft: 0,
      },
      { status: 429 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors.pin?.[0] ?? "PIN tidak valid" },
      { status: 400 }
    );
  }

  const pin = parsed.data.pin;
  if (!(await verifyNumpadPinForGate(pin))) {
    const failed = await recordFailedAttempt(clientId);
    return NextResponse.json(
      {
        error: "PIN salah",
        attemptsLeft: failed.attemptsLeft,
        locked: failed.locked,
        lockedUntil: failed.lockedUntil,
      },
      { status: 401 }
    );
  }

  const response = NextResponse.json({
    ok: true,
    scope: parsed.data.scope,
    expiresInSec: 600,
  });

  setVaultUnlockCookie(response, clientId, vaultUnlockSecureFlag());
  return response;
}
