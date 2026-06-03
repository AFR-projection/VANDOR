import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import {
  GATE_PIN_LENGTH,
  getGateCookieValue,
  readGateToken,
} from "@/lib/security/gate-edge";
import {
  listLoginHistory,
  revokeSession,
} from "@/lib/security/gate";
import { verifyNumpadPinForGate } from "@/lib/security/pin-gate";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const token = getGateCookieValue(request);
  const payload = readGateToken(token);
  const currentSid = payload?.sid ?? null;

  const rows = await listLoginHistory(80);

  return Response.json({
    currentSid,
    entries: rows.map((row) => ({
      id: row.id,
      sid: row.sid,
      ip: row.ip,
      userAgent: row.userAgent,
      locationLabel: row.locationLabel,
      city: row.city,
      region: row.region,
      country: row.country,
      loggedInAt: row.loggedInAt.toISOString(),
      active: row.active,
      current: Boolean(currentSid && row.sid === currentSid),
    })),
  });
}

const revokeSchema = z.object({
  sid: z.string().min(8),
  currentPin: z.string().regex(/^\d{4}$/, `PIN harus ${GATE_PIN_LENGTH} digit`),
});

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Data tidak valid" }, { status: 400 });
  }

  if (!(await verifyNumpadPinForGate(parsed.data.currentPin))) {
    return Response.json({ error: "PIN salah" }, { status: 401 });
  }

  await revokeSession(parsed.data.sid);

  return Response.json({ ok: true });
}
