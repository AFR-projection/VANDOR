import { tool } from "ai";
import { z } from "zod";
import {
  createNote,
  createTask,
  deleteNote,
  getNoteById,
  getNoteByTitle,
  listNotes,
  listTasks,
  updateNote,
  updateTask,
} from "@/lib/memory/assistant-db";
import {
  getMemoryById,
  listRecentMemories,
  saveMemory,
  searchAllUserData,
} from "@/lib/memory/queries";

export function makeAssistantTools(userId: string, chatId: string) {
  const saveMemoryTool = tool({
    description:
      "Save or update an important fact in long-term memory. REQUIRED when user says ingat/jangan lupa/remember. Also use for preferences, name, job, goals, relationships. Similar facts merge automatically.",
    inputSchema: z.object({
      content: z.string().min(3).max(500),
      category: z
        .enum(["fact", "preference", "goal", "person", "event", "instruction"])
        .optional(),
      importance: z.number().int().min(1).max(10).optional(),
    }),
    execute: async ({ content, category, importance }) => {
      const id = await saveMemory({
        userId,
        content,
        category: category ?? "fact",
        importance: importance ?? 8,
        sourceChatId: chatId,
        mergeSimilar: true,
      });
      return { ok: Boolean(id), memoryId: id, content };
    },
  });

  const getMemoryTool = tool({
    description:
      "Retrieve a specific memory by ID, or list recent memories if no ID given.",
    inputSchema: z.object({
      memoryId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({ memoryId, limit }) => {
      if (memoryId) {
        const memory = await getMemoryById({ userId, memoryId });
        return { memories: memory ? [memory] : [] };
      }
      const memories = await listRecentMemories({ userId, limit: limit ?? 10 });
      return { memories };
    },
  });

  const searchDbTool = tool({
    description:
      "Semantic search across user memories, notes, and tasks. Use when user asks 'pernah bahas?', 'ingat gak?', or needs past context.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    execute: async ({ query, limit }) => {
      return searchAllUserData({ userId, query, limit: limit ?? 8 });
    },
  });

  const manageNotesTool = tool({
    description:
      "Personal notes (catatan): create, list titles only, get full note by title/id, update, delete. Use for /catat, 'catatan saya', or when user picks a title from the list.",
    inputSchema: z.object({
      action: z.enum(["create", "list", "get", "update", "delete"]),
      title: z.string().min(1).max(200).optional(),
      content: z.string().min(1).max(8000).optional(),
      noteId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: async ({ action, title, content, noteId, limit }) => {
      if (action === "list") {
        const notes = await listNotes(userId, limit ?? 30);
        return {
          count: notes.length,
          notes: notes.map((n, i) => ({
            index: i + 1,
            id: n.id,
            title: n.title,
            updatedAt: n.updatedAt,
          })),
        };
      }

      if (action === "get") {
        const note =
          noteId && !title
            ? await getNoteById({ userId, noteId })
            : title
              ? await getNoteByTitle({ userId, titleQuery: title })
              : null;
        if (!note) {
          return { ok: false, error: "Catatan tidak ditemukan" };
        }
        return {
          ok: true,
          note: {
            id: note.id,
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
          },
        };
      }

      if (action === "create") {
        if (!title?.trim() || !content?.trim()) {
          return { ok: false, error: "Judul dan isi wajib untuk create" };
        }
        const note = await createNote({
          userId,
          title: title.trim(),
          content: content.trim(),
        });
        return { ok: true, message: `Catatan "${note.title}" disimpan.`, note };
      }

      if (action === "update") {
        if (!noteId) {
          return { ok: false, error: "noteId wajib untuk update" };
        }
        const note = await updateNote({
          userId,
          noteId,
          title: title?.trim(),
          content: content?.trim(),
        });
        return { ok: Boolean(note), note };
      }

      if (action === "delete") {
        if (!noteId) {
          return { ok: false, error: "noteId wajib untuk delete" };
        }
        const removed = await deleteNote({ userId, noteId });
        return {
          ok: Boolean(removed),
          deleted: removed ? { id: removed.id, title: removed.title } : null,
        };
      }

      return { ok: false, error: "Invalid action" };
    },
  });

  const updateTaskTool = tool({
    description: "Create or update a task for the user.",
    inputSchema: z.object({
      action: z.enum(["create", "update", "list"]),
      taskId: z.string().uuid().optional(),
      title: z.string().min(1).max(300).optional(),
      status: z.enum(["pending", "done", "cancelled"]).optional(),
    }),
    execute: async ({ action, taskId, title, status }) => {
      if (action === "list") {
        const tasks = await listTasks(userId);
        return { tasks };
      }
      if (action === "create" && title) {
        const task = await createTask({ userId, title });
        return { ok: true, task };
      }
      if (action === "update" && taskId) {
        const task = await updateTask({ userId, taskId, title, status });
        return { ok: Boolean(task), task };
      }
      return { ok: false, error: "Invalid task action or missing fields" };
    },
  });

  return {
    saveMemory: saveMemoryTool,
    getMemory: getMemoryTool,
    searchDb: searchDbTool,
    manageNotes: manageNotesTool,
    updateTask: updateTaskTool,
  };
}
