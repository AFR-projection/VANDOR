import { desc, eq, gt } from "drizzle-orm";
import { platformEvent } from "@/lib/db/schema";
import { getPlatformDb } from "../db";
import type { PlatformAgentId, PlatformEventTopic } from "../core/types";

export type PlatformEventInput = {
  topic: PlatformEventTopic | string;
  runId?: string | null;
  stepId?: string | null;
  agentId?: PlatformAgentId | string | null;
  payload?: unknown;
};

type EventHandler = (event: PlatformEventInput & { id: string }) => void | Promise<void>;

const handlers = new Map<string, EventHandler[]>();

/** Subscribe in-process (dashboard SSE / orchestrator hooks). */
export function onPlatformEvent(
  topic: string,
  handler: EventHandler
): void {
  const list = handlers.get(topic) ?? [];
  list.push(handler);
  handlers.set(topic, list);
}

/** Publish ke DB + trigger handler in-process. */
export async function publishPlatformEvent(
  input: PlatformEventInput
): Promise<{ id: string }> {
  const db = getPlatformDb();
  const inserted = await db
    .insert(platformEvent)
    .values({
      topic: input.topic.slice(0, 64),
      runId: input.runId ?? null,
      stepId: input.stepId ?? null,
      agentId: input.agentId ? String(input.agentId).slice(0, 64) : null,
      payload: input.payload ?? null,
    })
    .returning({ id: platformEvent.id });

  const id = inserted[0].id;
  const enriched = { ...input, id };

  const matched = [
    ...(handlers.get(input.topic) ?? []),
    ...(handlers.get("*") ?? []),
  ];
  await Promise.all(
    matched.map((h) =>
      Promise.resolve(h(enriched)).catch(() => {
        /* handler errors must not break publish */
      })
    )
  );

  return { id };
}

export async function listEventsForRun(runId: string, limit = 100) {
  const db = getPlatformDb();
  return db
    .select()
    .from(platformEvent)
    .where(eq(platformEvent.runId, runId))
    .orderBy(desc(platformEvent.createdAt))
    .limit(limit);
}

/** Poll events since cursor (SSE / dashboard live feed). */
export async function pollPlatformEvents(input: {
  runId?: string;
  afterId?: string;
  afterCreatedAt?: Date;
  limit?: number;
}) {
  const db = getPlatformDb();
  const limit = input.limit ?? 50;

  if (input.runId) {
    return db
      .select()
      .from(platformEvent)
      .where(eq(platformEvent.runId, input.runId))
      .orderBy(desc(platformEvent.createdAt))
      .limit(limit);
  }

  if (input.afterCreatedAt) {
    return db
      .select()
      .from(platformEvent)
      .where(gt(platformEvent.createdAt, input.afterCreatedAt))
      .orderBy(desc(platformEvent.createdAt))
      .limit(limit);
  }

  return db
    .select()
    .from(platformEvent)
    .orderBy(desc(platformEvent.createdAt))
    .limit(limit);
}

export async function listRecentPlatformEvents(limit = 50) {
  const db = getPlatformDb();
  return db
    .select()
    .from(platformEvent)
    .orderBy(desc(platformEvent.createdAt))
    .limit(limit);
}

export function clearPlatformEventHandlers(): void {
  handlers.clear();
}
