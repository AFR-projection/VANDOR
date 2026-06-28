import { desc, eq } from "drizzle-orm";
import {
  type AgentTerminalStream,
  agentTerminalLog,
} from "@/lib/db/schema";
import { db } from "./db";
import { generateUUID } from "@/lib/utils";

export type TerminalLineInput = {
  sessionId: string;
  stream?: AgentTerminalStream;
  line: string;
  level?: "stdout" | "stderr" | "info" | "error" | "cmd";
  command?: string;
  exitCode?: number;
  taskId?: string;
};

/** Simpan satu baris output terminal ke DB (bukti nyata). */
export async function appendTerminalLine(
  input: TerminalLineInput
): Promise<void> {
  try {
    await db.insert(agentTerminalLog).values({
      sessionId: input.sessionId,
      stream: input.stream ?? "cli",
      line: input.line.slice(0, 8000),
      level: input.level ?? "stdout",
      command: input.command?.slice(0, 2000),
      exitCode: input.exitCode,
      taskId: input.taskId ?? null,
    });
  } catch {
    /* non-fatal — CLI tetap jalan */
  }
}

export async function listTerminalLogs(input?: {
  sessionId?: string;
  limit?: number;
}): Promise<Array<typeof agentTerminalLog.$inferSelect>> {
  const limit = Math.min(input?.limit ?? 200, 500);
  if (input?.sessionId) {
    return db
      .select()
      .from(agentTerminalLog)
      .where(eq(agentTerminalLog.sessionId, input.sessionId))
      .orderBy(agentTerminalLog.createdAt)
      .limit(limit);
  }
  return db
    .select()
    .from(agentTerminalLog)
    .orderBy(desc(agentTerminalLog.createdAt))
    .limit(limit);
}

export function newTerminalSessionId(): string {
  return generateUUID();
}
