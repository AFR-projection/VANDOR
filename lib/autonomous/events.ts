import { desc } from "drizzle-orm";
import { type AgentEventSeverity, agentEvent } from "@/lib/db/schema";
import { db } from "./db";

export type AgentEventInput = {
  type: string;
  severity?: AgentEventSeverity;
  source: string;
  message: string;
  payload?: unknown;
};

type TriggerHandler = (event: AgentEventInput) => void | Promise<void>;

const triggers = new Map<string, TriggerHandler[]>();

/** Daftarkan handler untuk tipe event tertentu (atau "*" untuk semua). */
export function onEvent(type: string, handler: TriggerHandler): void {
  const list = triggers.get(type) ?? [];
  list.push(handler);
  triggers.set(type, list);
}

/** Emit event: persist ke DB + jalankan trigger terdaftar. */
export async function emitEvent(input: AgentEventInput): Promise<void> {
  try {
    await db.insert(agentEvent).values({
      type: input.type.slice(0, 64),
      severity: input.severity ?? "info",
      source: input.source.slice(0, 64),
      message: input.message.slice(0, 2000),
      payload: input.payload ?? null,
    });
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: surface event persist failure
    console.error("emitEvent persist failed:", error);
  }

  const handlers = [
    ...(triggers.get(input.type) ?? []),
    ...(triggers.get("*") ?? []),
  ];
  await Promise.all(
    handlers.map((h) =>
      Promise.resolve(h(input)).catch((err) => {
        // biome-ignore lint/suspicious/noConsole: trigger error must surface
        console.error(`Trigger for '${input.type}' failed:`, err);
      })
    )
  );
}

export function listRecentEvents(limit = 100) {
  return db
    .select()
    .from(agentEvent)
    .orderBy(desc(agentEvent.createdAt))
    .limit(limit);
}
