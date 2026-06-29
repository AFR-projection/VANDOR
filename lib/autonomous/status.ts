import { getAgentState } from "./state";
import { listPendingApprovals } from "./permission";
import { listActiveGoals } from "./goals";
import { listRecentTasks } from "./tasks";
import { listRecentEvents } from "./events";
import { collectMetrics } from "./metrics";
import { collectServiceHealth } from "./services";

/** Snapshot ringkas untuk slash /agent dan /status. */
export async function formatAgentStatus(): Promise<string> {
  const [state, approvals, goals, tasks, events, metrics, services] =
    await Promise.all([
      getAgentState(),
      listPendingApprovals(5),
      listActiveGoals(5),
      listRecentTasks(5),
      listRecentEvents(5),
      collectMetrics().catch(() => null),
      collectServiceHealth().catch(() => []),
    ]);

  const down = services.filter((s) => !s.healthy);
  const lines = [
    "**VANDOR** — status sistem",
    "",
    `Mode: **${state.mode}** · Status: **${state.killSwitch ? "KILL SWITCH" : state.status}**`,
    `Tick #${state.tickCount} · Heartbeat: ${state.lastHeartbeatAt?.toISOString() ?? "—"}`,
    "",
  ];

  if (metrics) {
    lines.push(
      `**Metrik:** CPU ${metrics.cpuPct}% · RAM ${metrics.memUsedPct}% · Disk ${metrics.diskUsedPct ?? "?"}%`
    );
  }

  lines.push(
    `**Service:** ${services.length - down.length}/${services.length} sehat` +
      (down.length ? ` (${down.map((s) => s.name).join(", ")} down)` : "")
  );

  lines.push(`**Approval pending:** ${approvals.length}`);
  if (approvals.length > 0) {
    for (const a of approvals.slice(0, 3)) {
      lines.push(`- [${a.riskLevel}] ${a.summary.slice(0, 80)}`);
    }
  }

  lines.push(`**Goal aktif:** ${goals.length}`);
  for (const g of goals.slice(0, 3)) {
    lines.push(`- ${g.title}`);
  }

  lines.push("", "**Task terbaru:**");
  if (tasks.length === 0) {
    lines.push("- (kosong)");
  } else {
    for (const t of tasks) {
      lines.push(`- [${t.status}] ${t.title}`);
    }
  }

  lines.push("", "**Event terbaru:**");
  for (const e of events.slice(0, 3)) {
    lines.push(`- [${e.severity}] ${e.message.slice(0, 100)}`);
  }

  lines.push("", "_Dashboard lengkap: Pengaturan → Operator_");
  return lines.join("\n");
}
