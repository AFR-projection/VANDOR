import "server-only";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { toolEvent } from "@/lib/db/schema";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export type ToolEventInput = {
  userId: string;
  chatId?: string | null;
  toolName: string;
  status: "ok" | "error";
  durationMs?: number;
  detail?: string | null;
};

export async function recordToolEvent(input: ToolEventInput): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.insert(toolEvent).values({
      userId: input.userId,
      chatId: input.chatId ?? null,
      toolName: input.toolName.slice(0, 64),
      status: input.status,
      durationMs: input.durationMs ?? null,
      detail: input.detail?.slice(0, 500) ?? null,
    });
  } catch (error) {
    console.error("recordToolEvent failed:", error);
  }
}

export async function listToolEvents(userId: string, limit = 40) {
  if (!process.env.POSTGRES_URL) {
    return [];
  }
  return db
    .select()
    .from(toolEvent)
    .where(eq(toolEvent.userId, userId))
    .orderBy(desc(toolEvent.createdAt))
    .limit(limit);
}
