import { desc } from "drizzle-orm";
import { agentEvent, agentNotification } from "@/lib/db/schema";
import { db } from "./db";

/** Konteks alert/event terbaru — untuk chat WA supaya VANDOR ingat apa yang baru dikirim. */
export async function buildRecentAlertsContextBlock(
  limit = 4
): Promise<string> {
  const [notifs, events] = await Promise.all([
    db
      .select({
        title: agentNotification.title,
        body: agentNotification.body,
        level: agentNotification.level,
        createdAt: agentNotification.createdAt,
      })
      .from(agentNotification)
      .orderBy(desc(agentNotification.createdAt))
      .limit(limit),
    db
      .select({
        severity: agentEvent.severity,
        message: agentEvent.message,
        createdAt: agentEvent.createdAt,
      })
      .from(agentEvent)
      .orderBy(desc(agentEvent.createdAt))
      .limit(3),
  ]);

  if (notifs.length === 0 && events.length === 0) {
    return "";
  }

  const lines = [
    "## Alert & event terbaru (KAMU yang kirim ke owner via WA)",
    "Owner mungkin membalas alert ini. Jelaskan dengan sopan — jangan mengejek atau asumsikan 'nyolot'.",
  ];

  for (const n of notifs) {
    const ago = n.createdAt.toISOString().slice(0, 16);
    lines.push(
      `- [${n.level} ${ago}] ${n.title}: ${n.body.slice(0, 350).replace(/\n/g, " ")}`
    );
  }

  for (const e of events.slice(0, 2)) {
    if (e.severity === "critical" || e.severity === "error") {
      lines.push(
        `- [event ${e.severity}] ${e.message.slice(0, 200)}`
      );
    }
  }

  return lines.join("\n");
}
