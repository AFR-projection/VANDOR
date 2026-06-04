import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chatSummary, userNote, userTask } from "@/lib/db/schema";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

export async function getChatSummary(chatId: string) {
  const rows = await db
    .select()
    .from(chatSummary)
    .where(eq(chatSummary.chatId, chatId))
    .limit(1);
  return rows.at(0) ?? null;
}

export async function upsertChatSummary({
  chatId,
  summary,
  messageCount,
}: {
  chatId: string;
  summary: string;
  messageCount: number;
}) {
  await db
    .insert(chatSummary)
    .values({ chatId, summary, messageCount, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: chatSummary.chatId,
      set: { summary, messageCount, updatedAt: new Date() },
    });
}

export async function createNote({
  userId,
  title,
  content,
}: {
  userId: string;
  title: string;
  content: string;
}) {
  const [row] = await db
    .insert(userNote)
    .values({ userId, title, content })
    .returning({ id: userNote.id, title: userNote.title });
  return row;
}

export async function listNotes(userId: string, limit = 20) {
  return db
    .select({
      id: userNote.id,
      title: userNote.title,
      content: userNote.content,
      updatedAt: userNote.updatedAt,
    })
    .from(userNote)
    .where(eq(userNote.userId, userId))
    .orderBy(sql`${userNote.updatedAt} DESC`)
    .limit(limit);
}

export async function getNoteById({
  userId,
  noteId,
}: {
  userId: string;
  noteId: string;
}) {
  const rows = await db
    .select()
    .from(userNote)
    .where(and(eq(userNote.id, noteId), eq(userNote.userId, userId)))
    .limit(1);
  return rows.at(0) ?? null;
}

export async function getNoteByTitle({
  userId,
  titleQuery,
}: {
  userId: string;
  titleQuery: string;
}) {
  const q = titleQuery.trim().toLowerCase();
  if (!q) {
    return null;
  }
  const notes = await listNotes(userId, 50);
  const exact = notes.find((n) => n.title.toLowerCase() === q);
  if (exact) {
    return exact;
  }
  const partial = notes.find((n) => n.title.toLowerCase().includes(q));
  return partial ?? null;
}

export async function updateNote({
  userId,
  noteId,
  title,
  content,
}: {
  userId: string;
  noteId: string;
  title?: string;
  content?: string;
}) {
  const updates: Partial<{
    title: string;
    content: string;
    updatedAt: Date;
  }> = { updatedAt: new Date() };
  if (title?.trim()) {
    updates.title = title.trim();
  }
  if (content?.trim()) {
    updates.content = content.trim();
  }
  if (!updates.title && !updates.content) {
    return null;
  }

  const [row] = await db
    .update(userNote)
    .set(updates)
    .where(and(eq(userNote.id, noteId), eq(userNote.userId, userId)))
    .returning({
      id: userNote.id,
      title: userNote.title,
      content: userNote.content,
      updatedAt: userNote.updatedAt,
    });
  return row ?? null;
}

export async function deleteNote({
  userId,
  noteId,
}: {
  userId: string;
  noteId: string;
}) {
  const [row] = await db
    .delete(userNote)
    .where(and(eq(userNote.id, noteId), eq(userNote.userId, userId)))
    .returning({ id: userNote.id, title: userNote.title });
  return row ?? null;
}

export async function createTask({
  userId,
  title,
  dueAt,
}: {
  userId: string;
  title: string;
  dueAt?: Date;
}) {
  const [row] = await db
    .insert(userTask)
    .values({ userId, title, dueAt: dueAt ?? null })
    .returning({ id: userTask.id, title: userTask.title, status: userTask.status });
  return row;
}

export async function updateTask({
  userId,
  taskId,
  title,
  status,
}: {
  userId: string;
  taskId: string;
  title?: string;
  status?: "pending" | "done" | "cancelled";
}) {
  const updates: Partial<{ title: string; status: "pending" | "done" | "cancelled"; updatedAt: Date }> = {
    updatedAt: new Date(),
  };
  if (title) updates.title = title;
  if (status) updates.status = status;

  const [row] = await db
    .update(userTask)
    .set(updates)
    .where(and(eq(userTask.id, taskId), eq(userTask.userId, userId)))
    .returning({ id: userTask.id, title: userTask.title, status: userTask.status });

  return row ?? null;
}

export async function listTasks(userId: string, limit = 20) {
  return db
    .select({
      id: userTask.id,
      title: userTask.title,
      status: userTask.status,
      dueAt: userTask.dueAt,
      updatedAt: userTask.updatedAt,
    })
    .from(userTask)
    .where(eq(userTask.userId, userId))
    .orderBy(sql`${userTask.updatedAt} DESC`)
    .limit(limit);
}
