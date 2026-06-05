import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { memoryCategories } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import {
  deleteAllMemories,
  listAllMemories,
  saveMemory,
} from "@/lib/memory/queries";
import { requireClientAccess } from "@/lib/security/client-access";

const createSchema = z.object({
  content: z.string().min(3).max(2000),
  category: z.enum(memoryCategories).optional(),
  importance: z.number().int().min(1).max(10).optional(),
  visual: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 80), 200);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  const category = searchParams.get("category");
  const filter = searchParams.get("filter");

  const visualOnly =
    filter === "visual" ? true : filter === "text" ? false : undefined;

  const memories = await listAllMemories({
    userId: session.user.id,
    limit,
    offset,
    category:
      category &&
      memoryCategories.includes(category as (typeof memoryCategories)[number])
        ? (category as (typeof memoryCategories)[number])
        : undefined,
    visualOnly,
  });

  return Response.json({ memories });
}

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { content, category, importance, visual, metadata } = parsed.data;

  const id = await saveMemory({
    userId: session.user.id,
    content,
    category: category ?? "fact",
    importance: importance ?? 5,
    metadata: visual ? { ...metadata, visual: true } : metadata,
  });

  if (!id) {
    return Response.json({ error: "Failed to save memory" }, { status: 500 });
  }

  return Response.json({ id }, { status: 201 });
}

export async function DELETE(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const visualOnly = searchParams.get("visualOnly") === "1";

  const count = await deleteAllMemories({
    userId: session.user.id,
    visualOnly,
  });

  return Response.json({ deleted: count });
}
