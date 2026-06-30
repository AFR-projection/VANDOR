import {
  collectSystemAwareness,
  formatAwarenessForUser,
} from "@/lib/autonomous/awareness";
import {
  dispatchFromChat,
  isChatJobType,
  type ChatJobType,
} from "@/lib/autonomous/chat-dispatch";
import {
  getMemoryById,
  listRecentMemories,
  saveMemory,
  searchAllUserData,
} from "@/lib/memory/queries";
import { runWebSearch } from "@/lib/search/engine";
import type {
  PlatformToolContext,
  PlatformToolExecuteResult,
} from "../core/types";

function pickQuery(input: Record<string, unknown>): string {
  return String(input.query ?? input.userRequest ?? input.message ?? "").trim();
}

async function bridgeAgentWork(
  input: Record<string, unknown>,
  ctx: PlatformToolContext
): Promise<PlatformToolExecuteResult> {
  const chatId = ctx.chatId;
  if (!chatId) {
    return { ok: false, error: "agentWork membutuhkan chatId workflow" };
  }

  const action = String(input.action ?? "dispatch");
  if (action !== "dispatch") {
    return {
      ok: false,
      error: "agentWork dari platform hanya mendukung action=dispatch",
    };
  }

  const jobType = String(input.jobType ?? "") as ChatJobType;
  if (!isChatJobType(jobType)) {
    return { ok: false, error: `jobType tidak valid: ${jobType}` };
  }

  const result = await dispatchFromChat({
    jobType,
    chatId,
    userId: ctx.userId,
    fullBuild: Boolean(input.fullBuild),
    includeUltracite: Boolean(input.includeUltracite),
    notifyOnComplete: input.notifyOnComplete !== false,
  });

  return {
    ok: result.ok,
    data: result,
    error: result.error,
    summary: result.message,
  };
}

/** Eksekusi chat tools dari platform layer (Fase 3). */
export async function executeChatToolForPlatform(
  toolName: string,
  input: Record<string, unknown>,
  ctx: PlatformToolContext
): Promise<PlatformToolExecuteResult> {
  switch (toolName) {
    case "checkSystem": {
      const snapshot = await collectSystemAwareness({ live: true });
      return {
        ok: true,
        data: snapshot,
        summary: formatAwarenessForUser(snapshot),
      };
    }
    case "agentWork":
      return bridgeAgentWork(input, ctx);
    case "webSearch": {
      const query = pickQuery(input);
      if (query.length < 2) {
        return { ok: false, error: "query webSearch kosong" };
      }
      const result = await runWebSearch(query, {
        maxResults: Number(input.maxResults ?? 5),
        userId: ctx.userId,
        intents: { news: Boolean(input.news) },
      });
      const count = result.sources?.length ?? 0;
      return {
        ok: true,
        data: result,
        summary: `${count} sumber untuk "${query.slice(0, 80)}"`,
      };
    }
    case "searchDb": {
      const query = pickQuery(input);
      if (query.length < 2) {
        return { ok: false, error: "query searchDb kosong" };
      }
      const data = await searchAllUserData({
        userId: ctx.userId,
        query,
        limit: Number(input.limit ?? 8),
      });
      const hits =
        (data.memories?.length ?? 0) + (data.tasks?.length ?? 0);
      return {
        ok: true,
        data,
        summary: `${hits} item relevan di memori/task`,
      };
    }
    case "getMemory": {
      const memoryId = input.memoryId ? String(input.memoryId) : undefined;
      if (memoryId) {
        const memory = await getMemoryById({
          userId: ctx.userId,
          memoryId,
        });
        return {
          ok: true,
          data: { memories: memory ? [memory] : [] },
          summary: memory ? "1 memori ditemukan" : "Memori tidak ditemukan",
        };
      }
      const memories = await listRecentMemories({
        userId: ctx.userId,
        limit: Number(input.limit ?? 10),
      });
      return {
        ok: true,
        data: { memories },
        summary: `${memories.length} memori terbaru`,
      };
    }
    case "saveMemory": {
      const content = String(input.content ?? "").trim();
      if (content.length < 3) {
        return { ok: false, error: "content saveMemory terlalu pendek" };
      }
      const id = await saveMemory({
        userId: ctx.userId,
        content,
        category:
          (input.category as
            | "fact"
            | "preference"
            | "goal"
            | "person"
            | "event"
            | "instruction") ?? "fact",
        importance: Number(input.importance ?? 8),
        sourceChatId: ctx.chatId ?? undefined,
        mergeSimilar: true,
      });
      return {
        ok: Boolean(id),
        data: { memoryId: id, content },
        summary: id ? "Memori disimpan" : "Gagal simpan memori",
      };
    }
    case "createPdf": {
      const title = String(input.title ?? "Dokumen VANDOR").slice(0, 160);
      const body = String(
        input.body ?? input.userRequest ?? input.content ?? ""
      ).slice(0, 40_000);
      if (body.length < 1) {
        return { ok: false, error: "body PDF kosong" };
      }
      try {
        const { buildPdfFromMarkdown } = await import(
          "@/lib/ai/tools/create-pdf"
        );
        const result = await buildPdfFromMarkdown({
          title,
          body,
          author: input.author ? String(input.author) : undefined,
        });
        const ok = Boolean((result as { ok?: boolean }).ok);
        return {
          ok,
          data: result,
          summary: ok ? `PDF "${title}" dibuat` : "Gagal buat PDF",
          error: ok
            ? undefined
            : String((result as { error?: string }).error ?? ""),
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    default:
      return {
        ok: false,
        error: `Chat tool '${toolName}' belum di-bridge platform (fase 3)`,
      };
  }
}
