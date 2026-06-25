import { auth } from "@/app/(auth)/auth";
import { listSkillLogs } from "@/lib/agent-skills/queries";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const url = new URL(request.url);
  const skillId = url.searchParams.get("skillId") ?? undefined;
  const limit = Number(url.searchParams.get("limit") ?? "50");

  const logs = await listSkillLogs(session.user.id, {
    skillId,
    limit: Math.min(limit, 200),
  });

  return Response.json({ logs });
}
