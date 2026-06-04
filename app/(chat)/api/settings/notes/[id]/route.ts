import { auth } from "@/app/(auth)/auth";
import { getNoteById } from "@/lib/memory/assistant-db";
import { requireClientAccess } from "@/lib/security/client-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const note = await getNoteById({ userId: session.user.id, noteId: id });
  if (!note) {
    return Response.json({ error: "Catatan tidak ditemukan" }, { status: 404 });
  }

  return Response.json({ note });
}
