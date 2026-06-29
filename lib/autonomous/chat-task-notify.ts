import type { AgentTask } from "@/lib/db/schema";
import { composeOperatorWhatsappMessage } from "./compose-message";
import { collectSystemAwareness } from "./awareness";
import type { ChatTaskPayload } from "./chat-dispatch";
import { notify } from "./notify";
import { recordChatTaskEvent } from "./operator-memory";
import { createLogger } from "./logger";

const log = createLogger("chat-task");

function summarizeOutcome(
  task: AgentTask,
  outcome: "done" | "failed",
  result?: unknown,
  error?: string
): string {
  if (outcome === "failed") {
    return `Pekerjaan "${task.title}" gagal: ${error?.slice(0, 400) ?? task.error ?? "unknown"}`;
  }
  const r = (result ?? task.result) as Record<string, unknown> | null;
  if (r?.awaitingApproval) {
    return `${task.title} menunggu approval owner di Operator/WhatsApp.`;
  }
  if (r && typeof r.summary === "string") {
    return `${task.title} selesai: ${r.summary.slice(0, 400)}`;
  }
  if (r && typeof r.ok === "boolean") {
    return `${task.title} selesai — ${r.ok ? "lulus" : "ada masalah"}.`;
  }
  if (r?.sessionId) {
    return `${task.title} selesai. Session ${String(r.sessionId).slice(0, 8)}.`;
  }
  return `${task.title} selesai.`;
}

/**
 * Setelah worker selesai/gagal task dari chat — catat memori + kabari owner (LLM).
 */
export async function notifyChatTaskOutcome(input: {
  task: AgentTask;
  outcome: "done" | "failed";
  result?: unknown;
  error?: string;
}): Promise<void> {
  const payload = input.task.payload as ChatTaskPayload | null;
  if (!payload || payload.requestedBy !== "chat") {
    return;
  }
  if (payload.notifyOnComplete === false) {
    return;
  }

  const summary = summarizeOutcome(
    input.task,
    input.outcome,
    input.result,
    input.error
  );

  await recordChatTaskEvent({
    userId: payload.sourceUserId,
    taskType: input.task.type,
    title: input.task.title,
    status: input.outcome,
    summary,
    chatId: payload.sourceChatId,
  });

  const r = input.result as { awaitingApproval?: boolean } | undefined;
  if (r?.awaitingApproval) {
    await notify({
      title: "VANDOR",
      body: summary,
      level: "warn",
    });
    return;
  }

  const snapshot = await collectSystemAwareness({ live: false });
  const kind = input.outcome === "done" ? "code_fix_ok" : "code_fix_failed";
  const body =
    (await composeOperatorWhatsappMessage({
      kind,
      snapshot,
      extra: summary,
    })) ?? summary;

  await notify({
    title: "VANDOR",
    body,
    level: input.outcome === "done" ? "info" : "warn",
    cooldownMs: 15 * 60_000,
  });

  log.info(
    `Chat task ${input.outcome}: ${input.task.type} ${input.task.id.slice(0, 8)}`
  );
}
