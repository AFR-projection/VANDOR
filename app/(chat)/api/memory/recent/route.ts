import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { listMemoriesSavedSince } from "@/lib/memory/queries";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");
  let since: Date;
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    since = Number.isNaN(parsed.getTime())
      ? new Date(Date.now() - 120_000)
      : parsed;
  } else {
    const seconds = Math.min(
      Math.max(Number(searchParams.get("seconds") ?? 120), 30),
      600
    );
    since = new Date(Date.now() - seconds * 1000);
  }

  const memories = await listMemoriesSavedSince({
    userId: session.user.id,
    since,
    limit: 8,
  });

  return Response.json({
    memories: memories.map((m) => ({
      content: m.content,
      category: m.category,
    })),
  });
}
