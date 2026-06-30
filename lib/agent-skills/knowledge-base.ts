import "server-only";

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEmbeddingOptionsForUser } from "@/lib/memory/embedding-options";
import { embeddingToSql, embedText } from "@/lib/memory/embeddings";
import type { KnowledgeBaseSkillConfig, SkillExecutionResult } from "./types";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 120;

export function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) {
      break;
    }
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.trim().length > 20);
}

export async function indexDocument(input: {
  documentId: string;
  userId: string;
  text: string;
}): Promise<{ chunkCount: number }> {
  const chunks = chunkText(input.text);
  await db.execute(
    sql`DELETE FROM "KnowledgeBaseChunk" WHERE "documentId" = ${input.documentId}`
  );

  const embedOpts = await getEmbeddingOptionsForUser(input.userId);

  for (let i = 0; i < chunks.length; i++) {
    const content = chunks[i];
    const vector = await embedText(content, {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    });
    const vectorSql = embeddingToSql(vector);
    await db.execute(sql`
      INSERT INTO "KnowledgeBaseChunk" ("documentId", "userId", "chunkIndex", "content", "embedding")
      VALUES (${input.documentId}, ${input.userId}, ${i}, ${content}, ${vectorSql}::vector)
    `);
  }

  return { chunkCount: chunks.length };
}

export async function searchKnowledgeBase(input: {
  userId: string;
  query: string;
  config?: KnowledgeBaseSkillConfig;
}): Promise<SkillExecutionResult> {
  const started = Date.now();
  const maxResults = input.config?.maxResults ?? 5;
  const minSimilarity = input.config?.minSimilarity ?? 0.35;

  try {
    const embedOpts = await getEmbeddingOptionsForUser(input.userId);
    const vector = await embedText(input.query, {
      apiKey: embedOpts.apiKey ?? undefined,
      model: embedOpts.model,
    });
    const vectorSql = embeddingToSql(vector);

    const rows = await db.execute<{
      content: string;
      fileName: string;
      similarity: number;
    }>(sql`
      SELECT
        kbc."content",
        kbd."fileName",
        1 - (kbc."embedding" <=> ${vectorSql}::vector) AS similarity
      FROM "KnowledgeBaseChunk" kbc
      JOIN "KnowledgeBaseDocument" kbd ON kbd."id" = kbc."documentId"
      WHERE kbc."userId" = ${input.userId}
        AND kbc."embedding" IS NOT NULL
        AND kbd."status" = 'indexed'
      ORDER BY kbc."embedding" <=> ${vectorSql}::vector
      LIMIT ${maxResults}
    `);

    const results = (
      rows as unknown as Array<{
        content: string;
        fileName: string;
        similarity: number;
      }>
    )
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => ({
        content: r.content,
        source: r.fileName,
        similarity: Number(r.similarity.toFixed(3)),
      }));

    return {
      ok: true,
      data: { results, count: results.length },
      executionTimeMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Pencarian KB gagal",
      executionTimeMs: Date.now() - started,
    };
  }
}

export async function extractKbText(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const lower = fileName.toLowerCase();

  if (mimeType.includes("pdf") || lower.endsWith(".pdf")) {
    const mod = await import("pdf-parse");
    const PDFParse = (
      mod as {
        PDFParse: new (opts: {
          data: Uint8Array;
        }) => {
          getText: () => Promise<{ text: string }>;
          destroy?: () => Promise<void>;
        };
      }
    ).PDFParse;
    const parser = new PDFParse({
      data: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
    });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy?.();
    }
  }

  if (
    mimeType.includes("wordprocessingml") ||
    mimeType.includes("msword") ||
    lower.endsWith(".docx")
  ) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType.includes("csv") || lower.endsWith(".csv")) {
    const Papa = await import("papaparse");
    const parsed = Papa.parse(buffer.toString("utf8"), { header: true });
    return JSON.stringify(parsed.data, null, 2);
  }

  if (mimeType.includes("json") || lower.endsWith(".json")) {
    const parsed = JSON.parse(buffer.toString("utf8")) as unknown;
    return JSON.stringify(parsed, null, 2);
  }

  return buffer.toString("utf8");
}
