import { auth } from "@/app/(auth)/auth";
import { listToolEvents } from "@/lib/observability/record";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const events = await listToolEvents(session.user.id, 50);
  return Response.json({
    events: events.map((e) => ({
      id: e.id,
      toolName: e.toolName,
      status: e.status,
      durationMs: e.durationMs,
      detail: e.detail,
      chatId: e.chatId,
      createdAt: e.createdAt,
    })),
  });
}
