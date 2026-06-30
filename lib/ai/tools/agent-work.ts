import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { collectSystemAwareness } from "@/lib/autonomous/awareness";
import {
  CHAT_JOB_TYPES,
  describeJobTypes,
  dispatchFromChat,
  getTaskById,
  listRecentAgentTasks,
  listTasksForChat,
  summarizeTaskForChat,
} from "@/lib/autonomous/chat-dispatch";
import { listPendingApprovals } from "@/lib/autonomous/permission";

/**
 * Satu tool untuk dispatch & lacak pekerjaan worker dari chat.
 * Nyata — menulis ke AgentTask DB, worker PM2 yang menjalankan.
 */
export function makeAgentWorkTool(input: { userId: string; chatId: string }) {
  return tool({
    description:
      "Kelola pekerjaan worker VANDOR (NYATA — antrian DB + PM2). " +
      "action=dispatch: minta worker scan/fix/cek log/uptime/monitor/VPS/deploy. " +
      "action=status: cek task by taskId atau antrian chat ini. " +
      "action=list: pekerjaan & approval pending terbaru. " +
      "Gunakan saat user minta scan codebase, cek log, deploy, monitor, atau tanya progress pekerjaan yang kamu dispatch.",
    inputSchema: z.object({
      action: z.enum(["dispatch", "status", "list"]),
      jobType: z.enum(CHAT_JOB_TYPES).optional(),
      taskId: z.string().uuid().optional(),
      fullBuild: z.boolean().optional(),
      includeUltracite: z.boolean().optional(),
    }),
    execute: async ({
      action,
      jobType,
      taskId,
      fullBuild,
      includeUltracite,
    }) => {
      if (action === "dispatch") {
        if (!jobType) {
          return {
            ok: false,
            error: "jobType wajib untuk dispatch",
            availableJobs: describeJobTypes(),
          };
        }
        return dispatchFromChat({
          jobType,
          chatId: input.chatId,
          userId: input.userId,
          fullBuild,
          includeUltracite,
        });
      }

      if (action === "status") {
        if (taskId) {
          const task = await getTaskById(taskId);
          if (!task) {
            return { ok: false, error: "Task tidak ditemukan", taskId };
          }
          return { ok: true, task: summarizeTaskForChat(task) };
        }
        const chatTasks = await listTasksForChat(input.chatId, 8);
        return {
          ok: true,
          tasks: chatTasks.map(summarizeTaskForChat),
          hint: "Pekerjaan dari chat ini. Worker tick ~30s.",
        };
      }

      const [tasks, approvals, awareness] = await Promise.all([
        listRecentAgentTasks(10),
        listPendingApprovals(5),
        collectSystemAwareness({ live: false }),
      ]);

      return {
        ok: true,
        worker: awareness.agent,
        healthScore: awareness.healthScore,
        recentTasks: tasks.map(summarizeTaskForChat),
        pendingApprovals: approvals.map((a) => ({
          id: a.id.slice(0, 8),
          summary: a.summary.slice(0, 200),
          riskLevel: a.riskLevel,
        })),
        availableJobs: describeJobTypes(),
      };
    },
  });
}
