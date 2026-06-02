import { tool } from "ai";
import { z } from "zod";
import {
  createNote,
  createTask,
  listNotes,
  listTasks,
  updateTask,
} from "@/lib/memory/assistant-db";
import {
  getMemoryById,
  listRecentMemories,
  saveMemory,
  searchAllUserData,
  searchMemories,
} from "@/lib/memory/queries";

export function makeAssistantTools(userId: string, chatId: string) {
  const saveMemoryTool = tool({
    description:
      "Save an important fact about the user to long-term memory. Use when user says 'remember', shares preferences, name, projects, goals, or standing instructions.",
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
        importance: importance ?? 7,
        sourceChatId: chatId,
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

  const createNoteTool = tool({
    description: "Create a personal note for the user.",
    inputSchema: z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(5000),
    }),
    execute: async ({ title, content }) => {
      const note = await createNote({ userId, title, content });
      return { ok: true, note };
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
    createNote: createNoteTool,
    updateTask: updateTaskTool,
  };
}

/** Alias for semantic memory search only */
export function makeSearchMemoriesTool(userId: string) {
  return tool({
    description: "Search long-term memories by meaning (semantic vector search).",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    execute: async ({ query, limit }) => {
      const memories = await searchMemories({
        userId,
        query,
        limit: limit ?? 6,
        minSimilarity: 0.55,
      });
      return { memories };
    },
  });
}
