import { NextResponse } from "next/server";
import { getClientAccessSnapshot } from "@/lib/security/client-access";
import {
  GATE_MAX_ATTEMPTS,
  GATE_PIN_LENGTH,
  getLockoutStatus,
  isGateConfigured,
} from "@/lib/security/gate";

export async function GET(request: Request) {
  if (!isGateConfigured()) {
    return NextResponse.json({
      configured: false,
      pinLength: GATE_PIN_LENGTH,
      maxAttempts: GATE_MAX_ATTEMPTS,
    });
  }

  const snapshot = await getClientAccessSnapshot(request);
  const lockout = await getLockoutStatus(snapshot.clientId);

  return NextResponse.json(
    {
      configured: true,
      pinLength: GATE_PIN_LENGTH,
      maxAttempts: GATE_MAX_ATTEMPTS,
      ip: snapshot.ip,
      gateValid: snapshot.gateValid,
      sessionRevoked: snapshot.sessionRevoked,
      requiresPin: snapshot.requiresPin,
      sessionActive:
        snapshot.gateValid && !snapshot.sessionRevoked ? true : false,
      ...lockout,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
