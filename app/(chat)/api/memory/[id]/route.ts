import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { memoryCategories } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { deleteMemory, updateMemory } from "@/lib/memory/queries";
import { requireClientAccess } from "@/lib/security/client-access";

const patchSchema = z.object({
  content: z.string().min(3).max(2000).optional(),
  category: z.enum(memoryCategories).optional(),
  importance: z.number().int().min(1).max(10).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await updateMemory({
    userId: session.user.id,
    memoryId: id,
    ...parsed.data,
  });

  if (!ok) {
    return Response.json({ error: "Memory not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;

  const ok = await deleteMemory({
    userId: session.user.id,
    memoryId: id,
  });

  if (!ok) {
    return Response.json({ error: "Memory not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
