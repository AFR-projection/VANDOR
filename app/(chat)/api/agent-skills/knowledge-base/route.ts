import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { auth } from "@/app/(auth)/auth";
import {
  extractKbText,
  indexDocument,
} from "@/lib/agent-skills/knowledge-base";
import { listKbDocuments } from "@/lib/agent-skills/queries";
import { knowledgeBaseDocument } from "@/lib/db/schema";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";

const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/json",
  "text/json",
]);

const MAX_SIZE = 10 * 1024 * 1024;

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const docs = await listKbDocuments(session.user.id);
  return Response.json({ documents: docs });
}

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "File wajib diunggah" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: "Ukuran file maksimal 10 MB" },
      { status: 400 }
    );
  }

  const mime = file.type || "application/octet-stream";
  const lower = file.name.toLowerCase();
  const allowed =
    ALLOWED_TYPES.has(mime) ||
    lower.endsWith(".pdf") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json");

  if (!allowed) {
    return Response.json(
      {
        error: "Format tidak didukung. Gunakan PDF, DOCX, TXT, CSV, atau JSON.",
      },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const [doc] = await db
    .insert(knowledgeBaseDocument)
    .values({
      userId: session.user.id,
      fileName: file.name,
      mimeType: mime,
      fileSize: file.size,
      status: "processing",
      updatedAt: new Date(),
    })
    .returning();

  try {
    const text = await extractKbText(buffer, mime, file.name);
    if (!text.trim()) {
      throw new Error("Tidak ada teks yang bisa diekstrak dari dokumen");
    }

    const { chunkCount } = await indexDocument({
      documentId: doc.id,
      userId: session.user.id,
      text,
    });

    const [updated] = await db
      .update(knowledgeBaseDocument)
      .set({
        extractedText: text.slice(0, 50_000),
        status: "indexed",
        chunkCount,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseDocument.id, doc.id))
      .returning();

    return Response.json({ document: updated }, { status: 201 });
  } catch (error) {
    await db
      .update(knowledgeBaseDocument)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Indexing gagal",
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBaseDocument.id, doc.id));

    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Gagal mengindeks dokumen",
      },
      { status: 500 }
    );
  }
}
