import "server-only";

import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { toolEvent } from "@/lib/db/schema";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export type ActivityLevel = "info" | "warn" | "error" | "success";

export type ActivityLogInput = {
  userId: string;
  chatId?: string | null;
  source: string;
  level: ActivityLevel;
  message: string;
  detail?: string | null;
  durationMs?: number;
};

export type ToolEventInput = {
  userId: string;
  chatId?: string | null;
  toolName: string;
  status: "ok" | "error";
  durationMs?: number;
  detail?: string | null;
};

function levelToStatus(level: ActivityLevel): "ok" | "error" {
  return level === "error" ? "error" : "ok";
}

export async function recordActivityLog(
  input: ActivityLogInput
): Promise<void> {
  if (!process.env.POSTGRES_URL) {
    return;
  }
  try {
    await db.insert(toolEvent).values({
      userId: input.userId,
      chatId: input.chatId ?? null,
      toolName: input.source.slice(0, 64),
      level: input.level,
      message: input.message.slice(0, 400),
      status: levelToStatus(input.level),
      durationMs: input.durationMs ?? null,
      detail: input.detail?.slice(0, 4000) ?? null,
    });
  } catch (error) {
    console.error("recordActivityLog failed:", error);
  }
}

export async function recordToolEvent(input: ToolEventInput): Promise<void> {
  await recordActivityLog({
    userId: input.userId,
    chatId: input.chatId,
    source: `tool/${input.toolName}`,
    level: input.status === "error" ? "error" : "success",
    message:
      input.status === "error"
        ? `Tool ${input.toolName} gagal`
        : `Tool ${input.toolName} OK`,
    detail: input.detail ?? null,
    durationMs: input.durationMs,
  });
}

export async function listActivityLogs(userId: string, limit = 100) {
  if (!process.env.POSTGRES_URL) {
    return [];
  }
  const rows = await db
    .select()
    .from(toolEvent)
    .where(eq(toolEvent.userId, userId))
    .orderBy(desc(toolEvent.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    source: row.toolName,
    level:
      (row.level as ActivityLevel | null) ??
      (row.status === "error" ? "error" : "success"),
    message: row.message ?? row.toolName,
    status: row.status,
    durationMs: row.durationMs,
    detail: row.detail,
    chatId: row.chatId,
    createdAt: row.createdAt,
  }));
}

/** @deprecated use listActivityLogs */
export async function listToolEvents(userId: string, limit = 40) {
  return listActivityLogs(userId, limit);
}
