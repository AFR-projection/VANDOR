import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  collectSystemAwareness,
  formatAwarenessForUser,
} from "@/lib/autonomous/awareness";

/**
 * Tool chat — cek kesehatan sistem LIVE sebelum jawab pertanyaan status/aman/server.
 */
export function makeCheckSystemTool() {
  return tool({
    description:
      "Cek kesehatan VPS/server VANDOR secara LIVE (CPU, RAM, disk, service, isu, worker agent). WAJIB dipanggil sebelum menjawab pertanyaan tentang: sistem aman?, status server/VPS, kesehatan operator, CPU/RAM/disk, deploy, PM2, atau apakah ada masalah. Jangan asal jawab tanpa tool ini.",
    inputSchema: z.object({
      reason: z
        .string()
        .optional()
        .describe("Singkat: mengapa pengecekan dilakukan"),
    }),
    execute: async () => {
      const snapshot = await collectSystemAwareness({ live: true });
      const safe =
        !snapshot.agent.killSwitch &&
        !snapshot.agent.heartbeatStale &&
        snapshot.issues.filter(
          (i) => i.severity === "critical" || i.severity === "error"
        ).length === 0;

      return {
        ok: true,
        checkedAt: snapshot.at,
        overallSafe: safe,
        healthScore: snapshot.healthScore,
        grade: snapshot.grade,
        summary: snapshot.summary,
        details: formatAwarenessForUser(snapshot),
        agent: snapshot.agent,
        issueCount: snapshot.issues.length,
        issues: snapshot.issues.slice(0, 8).map((i) => ({
          severity: i.severity,
          title: i.title,
          detail: i.detail.slice(0, 200),
        })),
        pendingApprovals: snapshot.pendingApprovals,
        recentEvents: snapshot.recentEvents.slice(0, 5),
      };
    },
  });
}
