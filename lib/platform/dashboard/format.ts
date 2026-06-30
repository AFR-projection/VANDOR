import type { PlatformWorkflowRunStatus } from "@/lib/db/schema";

export const ACTIVE_RUN_STATUSES: PlatformWorkflowRunStatus[] = [
  "pending",
  "running",
  "waiting",
];

export function isActiveRunStatus(status: string): boolean {
  return (ACTIVE_RUN_STATUSES as readonly string[]).includes(status);
}

export function runStatusTone(
  status: string
): "success" | "warning" | "danger" | "muted" {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed" || status === "cancelled") {
    return "danger";
  }
  if (isActiveRunStatus(status)) {
    return "warning";
  }
  return "muted";
}

export function stepStatusTone(
  status: string
): "success" | "warning" | "danger" | "muted" {
  if (status === "completed") {
    return "success";
  }
  if (status === "failed" || status === "cancelled") {
    return "danger";
  }
  if (status === "running" || status === "waiting" || status === "queued") {
    return "warning";
  }
  return "muted";
}

export function formatDurationMs(
  start?: Date | string | null,
  end?: Date | string | null
): string {
  if (!start) {
    return "—";
  }
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Date.now();
  const ms = Math.max(0, to - from);
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${Math.round(ms / 1000)}s`;
  }
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

export function formatTimeAgo(iso: string | Date | null | undefined): string {
  if (!iso) {
    return "—";
  }
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) {
    return "baru saja";
  }
  if (diff < 3_600_000) {
    return `${Math.floor(diff / 60_000)} mnt lalu`;
  }
  if (diff < 86_400_000) {
    return `${Math.floor(diff / 3_600_000)} jam lalu`;
  }
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function topicLabel(topic: string): string {
  const map: Record<string, string> = {
    "workflow.created": "Workflow dibuat",
    "workflow.started": "Workflow mulai",
    "workflow.completed": "Workflow selesai",
    "workflow.failed": "Workflow gagal",
    "step.queued": "Step antre",
    "step.started": "Step mulai",
    "step.completed": "Step selesai",
    "step.failed": "Step gagal",
    "step.retry": "Step retry",
    "agent.status": "Status agent",
    "agent.log": "Log agent",
    "tool.started": "Tool mulai",
    "tool.completed": "Tool selesai",
    "queue.updated": "Antrian diperbarui",
    "error.raised": "Error",
  };
  return map[topic] ?? topic;
}
