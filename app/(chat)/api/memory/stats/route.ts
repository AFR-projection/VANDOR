import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { getMemoryStatsForUser } from "@/lib/memory/queries";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const stats = await getMemoryStatsForUser(session.user.id);
  return Response.json({ stats });
}
