import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { knowledgeBaseDocument } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;

  await db.execute(
    sql`DELETE FROM "KnowledgeBaseChunk" WHERE "documentId" = ${id} AND "userId" = ${session.user.id}`
  );

  await db
    .delete(knowledgeBaseDocument)
    .where(
      and(
        eq(knowledgeBaseDocument.id, id),
        eq(knowledgeBaseDocument.userId, session.user.id)
      )
    );

  return Response.json({ ok: true });
}
