import { tool } from "ai";
import { z } from "zod";
import { createTask, listTasks, updateTask } from "@/lib/memory/assistant-db";
import {
  getMemoryById,
  listRecentMemories,
  saveMemory,
  searchAllUserData,
} from "@/lib/memory/queries";
import { vaultFileTypes } from "@/lib/db/schema";
import {
  deleteVaultFile,
  getVaultFileById,
  listVaultFiles,
  resolveVaultFileTarget,
  searchVaultFiles,
  updateVaultFileMeta,
} from "@/lib/vault/queries";
import { toVaultSnapshot } from "@/lib/vault/snapshot";

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
      "Semantic search across user memories, vault metadata, and tasks. Use when user asks 'pernah bahas?', 'ingat gak?', or needs past context.",
    inputSchema: z.object({
      query: z.string().min(2),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    execute: async ({ query, limit }) => {
      return searchAllUserData({ userId, query, limit: limit ?? 8 });
    },
  });

  const vaultTypeEnum = z.enum(
    vaultFileTypes as unknown as [string, ...string[]]
  );

  const manageVaultTool = tool({
    description:
      "Berangkas pribadi terenkripsi (terpisah dari upload chat). Hanya metadata: id, name, type, summary, tags — tanpa isi file. Simpan via /v up. Buka isi hanya jika user /v open <id>.",
    inputSchema: z.object({
      action: z.enum(["list", "search", "get", "tag", "delete"]),
      query: z.string().min(1).max(500).optional(),
      fileId: z.string().uuid().optional(),
      fileType: vaultTypeEnum.optional(),
      tag: z.string().max(64).optional(),
      tags: z.array(z.string().max(64)).max(20).optional(),
      summary: z.string().max(500).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async ({
      action,
      query,
      fileId,
      fileType,
      tag,
      tags,
      summary,
      limit,
    }) => {
      const resolveId = async (): Promise<string | null> => {
        if (fileId) return fileId;
        if (query?.trim()) {
          const row = await resolveVaultFileTarget({
            userId,
            target: query.trim(),
          });
          return row?.id ?? null;
        }
        return null;
      };

      if (action === "list") {
        const files = await listVaultFiles({
          userId,
          limit: limit ?? 20,
          fileType: fileType as Parameters<typeof listVaultFiles>[0]["fileType"],
          tag,
          search: query,
        });
        return {
          ok: true,
          count: files.length,
          files,
          hint:
            files.length === 0
              ? "Vault kosong. User bisa /v up untuk upload."
              : "Metadata saja. Buka isi: /v open <id>",
        };
      }

      if (action === "search") {
        const q = query?.trim();
        if (!q || q.length < 2) {
          return {
            ok: false,
            error: "Query search minimal 2 karakter",
          };
        }
        const result = await searchVaultFiles({
          userId,
          query: q,
          limit: limit ?? 10,
          fileType: fileType as Parameters<
            typeof searchVaultFiles
          >[0]["fileType"],
        });
        return {
          ok: true,
          ...result,
          hint: "Hanya metadata. Isi file tidak diekspos ke AI.",
        };
      }

      if (action === "get") {
        const targetId = await resolveId();
        if (!targetId) {
          return {
            ok: false,
            error: "Butuh fileId atau query (nama/id file)",
          };
        }
        const file = await getVaultFileById({ userId, fileId: targetId });
        if (!file) {
          return { ok: false, error: "File tidak ditemukan di berangkas" };
        }
        return {
          ok: true,
          file: toVaultSnapshot(file),
          hint: `User buka untuk AI: /v open ${file.id}`,
        };
      }

      if (action === "tag") {
        const targetId = await resolveId();
        if (!targetId) {
          return { ok: false, error: "Butuh fileId atau query untuk tag" };
        }
        const file = await updateVaultFileMeta({
          userId,
          fileId: targetId,
          summary,
          tags,
        });
        return {
          ok: Boolean(file),
          file,
          error: file ? undefined : "Gagal memperbarui tag/summary",
        };
      }

      if (action === "delete") {
        const targetId = await resolveId();
        if (!targetId) {
          return { ok: false, error: "Butuh fileId atau query untuk hapus" };
        }
        const removed = await deleteVaultFile({ userId, fileId: targetId });
        return {
          ok: removed,
          error: removed ? undefined : "Gagal menghapus file",
        };
      }

      return { ok: false, error: "Aksi vault tidak valid" };
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
    manageVault: manageVaultTool,
    updateTask: updateTaskTool,
  };
}
