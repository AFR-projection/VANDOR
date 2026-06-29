import { desc, eq, sql } from "drizzle-orm";
import { agentTask } from "@/lib/db/schema";
import type { AgentTask } from "@/lib/db/schema";
import { db } from "./db";
import { enqueueTask } from "./tasks";
import { recordChatTaskEvent } from "./operator-memory";

/** Metadata task yang diminta dari chat (web/WA). */
export type ChatTaskPayload = {
  sourceChatId: string;
  sourceUserId: string;
  requestedBy: "chat";
  notifyOnComplete?: boolean;
  fullBuild?: boolean;
  includeUltracite?: boolean;
  autoFix?: boolean;
};

export const CHAT_JOB_TYPES = [
  "code_scan",
  "code_fix",
  "log_scan",
  "uptime_check",
  "monitor",
  "vps_status",
  "deploy",
] as const;

export type ChatJobType = (typeof CHAT_JOB_TYPES)[number];

const JOB_META: Record<
  ChatJobType,
  { title: string; priority: number; description: string }
> = {
  code_scan: {
    title: "Scan codebase (dari chat)",
    priority: 7,
    description: "TypeScript + opsional build; worker jalankan scan nyata",
  },
  code_fix: {
    title: "Perbaiki error codebase (dari chat)",
    priority: 8,
    description: "Pipeline auto-fix + rescan",
  },
  log_scan: {
    title: "Scan log error (dari chat)",
    priority: 6,
    description: "Baca log VPS yang dikonfigurasi",
  },
  uptime_check: {
    title: "Cek uptime HTTP (dari chat)",
    priority: 6,
    description: "Ping target uptime di env",
  },
  monitor: {
    title: "Snapshot metrik sistem (dari chat)",
    priority: 5,
    description: "CPU/RAM/disk live",
  },
  vps_status: {
    title: "Status VPS lengkap (dari chat)",
    priority: 6,
    description: "Snapshot CLI status di terminal operator",
  },
  deploy: {
    title: "Deploy git → build → pm2 (dari chat)",
    priority: 9,
    description: "Butuh approval owner — antrian approval dibuat otomatis",
  },
};

export function isChatJobType(value: string): value is ChatJobType {
  return (CHAT_JOB_TYPES as readonly string[]).includes(value);
}

export type DispatchFromChatInput = {
  jobType: ChatJobType;
  chatId: string;
  userId: string;
  fullBuild?: boolean;
  includeUltracite?: boolean;
  notifyOnComplete?: boolean;
};

export type DispatchFromChatResult = {
  ok: boolean;
  taskId?: string;
  deduped?: boolean;
  jobType: ChatJobType;
  title: string;
  message: string;
  error?: string;
};

/** Antrekan pekerjaan nyata ke worker — bukan simulasi. */
export async function dispatchFromChat(
  input: DispatchFromChatInput
): Promise<DispatchFromChatResult> {
  const meta = JOB_META[input.jobType];
  const payload: ChatTaskPayload = {
    sourceChatId: input.chatId,
    sourceUserId: input.userId,
    requestedBy: "chat",
    notifyOnComplete: input.notifyOnComplete ?? true,
    fullBuild: input.fullBuild ?? false,
    includeUltracite: input.includeUltracite ?? false,
    autoFix: input.jobType === "code_scan",
  };

  try {
    const { id, deduped } = await enqueueTask({
      type: input.jobType,
      title: meta.title,
      payload,
      priority: meta.priority,
      dedupe: true,
    });

    const message = deduped
      ? `Pekerjaan "${meta.title}" sudah ada di antrian worker (id ${id.slice(0, 8)}).`
      : `Pekerjaan "${meta.title}" masuk antrian worker. Id: ${id.slice(0, 8)}… — worker jalankan pada tick berikutnya (~30 detik).`;

    await recordChatTaskEvent({
      userId: input.userId,
      taskType: input.jobType,
      title: meta.title,
      status: "queued",
      summary: message,
      chatId: input.chatId,
    }).catch(() => null);

    return {
      ok: true,
      taskId: id,
      deduped,
      jobType: input.jobType,
      title: meta.title,
      message,
    };
  } catch (error) {
    return {
      ok: false,
      jobType: input.jobType,
      title: meta.title,
      message: "Gagal antrekan pekerjaan.",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getTaskById(id: string): Promise<AgentTask | null> {
  const rows = await db
    .select()
    .from(agentTask)
    .where(eq(agentTask.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTasksForChat(
  chatId: string,
  limit = 8
): Promise<AgentTask[]> {
  const rows = await db
    .select()
    .from(agentTask)
    .where(sql`${agentTask.payload}->>'sourceChatId' = ${chatId}`)
    .orderBy(desc(agentTask.createdAt))
    .limit(limit);
  return rows;
}

export async function listRecentAgentTasks(limit = 10): Promise<AgentTask[]> {
  const rows = await db
    .select()
    .from(agentTask)
    .orderBy(desc(agentTask.createdAt))
    .limit(limit);
  return rows;
}

export function summarizeTaskForChat(task: AgentTask): {
  id: string;
  shortId: string;
  type: string;
  title: string;
  status: string;
  createdAt: string;
  finishedAt: string | null;
  error: string | null;
  resultSummary: string | null;
  fromChat: boolean;
} {
  const payload = task.payload as ChatTaskPayload | null;
  let resultSummary: string | null = null;
  if (task.status === "done" && task.result) {
    try {
      const r = task.result as Record<string, unknown>;
      if (typeof r.summary === "string") {
        resultSummary = r.summary.slice(0, 300);
      } else if (r.scan && typeof r.scan === "object") {
        const scan = r.scan as { summary?: string; ok?: boolean };
        resultSummary =
          scan.summary?.slice(0, 300) ??
          (scan.ok ? "Scan OK" : "Scan gagal");
      } else if (typeof r.ok === "boolean") {
        resultSummary = r.ok ? "Selesai OK" : "Selesai dengan masalah";
      } else if (r.sessionId) {
        resultSummary = `Session ${String(r.sessionId).slice(0, 8)}`;
      } else {
        resultSummary = JSON.stringify(r).slice(0, 200);
      }
    } catch {
      resultSummary = "Selesai";
    }
  }

  return {
    id: task.id,
    shortId: task.id.slice(0, 8),
    type: task.type,
    title: task.title,
    status: task.status,
    createdAt: task.createdAt.toISOString(),
    finishedAt: task.finishedAt?.toISOString() ?? null,
    error: task.error?.slice(0, 300) ?? null,
    resultSummary,
    fromChat: payload?.requestedBy === "chat",
  };
}

export function describeJobTypes(): Array<{
  type: ChatJobType;
  description: string;
}> {
  return CHAT_JOB_TYPES.map((type) => ({
    type,
    description: JOB_META[type].description,
  }));
}
