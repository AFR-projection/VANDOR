import { autonomousConfig } from "@/lib/autonomous/config";
import { emitEvent } from "@/lib/autonomous/events";
import type { AgentEventSeverity } from "@/lib/db/schema";
import { agentEventSeverities } from "@/lib/db/schema";

function authWebhook(request: Request): boolean {
  const secret = autonomousConfig.webhookSecret;
  if (!secret) {
    return false;
  }
  const header =
    request.headers.get("x-vandor-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

export async function POST(request: Request) {
  if (!authWebhook(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    type?: unknown;
    severity?: unknown;
    source?: unknown;
    message?: unknown;
    payload?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length < 3) {
    return Response.json({ error: "message wajib" }, { status: 400 });
  }

  const severity =
    typeof body.severity === "string" &&
    agentEventSeverities.includes(body.severity as AgentEventSeverity)
      ? (body.severity as AgentEventSeverity)
      : "warn";

  await emitEvent({
    type: typeof body.type === "string" ? body.type.slice(0, 64) : "webhook",
    severity,
    source:
      typeof body.source === "string" ? body.source.slice(0, 64) : "webhook",
    message: message.slice(0, 2000),
    payload: body.payload ?? null,
  });

  return Response.json({ ok: true });
}
