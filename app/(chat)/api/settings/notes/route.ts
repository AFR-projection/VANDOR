import { auth } from "@/app/(auth)/auth";
import { listNotes } from "@/lib/memory/assistant-db";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const notes = await listNotes(session.user.id, 50);
  return Response.json({
    notes: notes.map((n, i) => ({
      index: i + 1,
      id: n.id,
      title: n.title,
      preview: n.content.slice(0, 120),
      updatedAt: n.updatedAt,
    })),
  });
}
