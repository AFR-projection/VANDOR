"use client";

import {
  ActivityIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  Loader2Icon,
  RefreshCwIcon,
  WorkflowIcon,
  XCircleIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { apiBasePath } from "@/lib/app-url";
import { cn } from "@/lib/utils";

const base = apiBasePath;

type RunFilter = "active" | "all" | "completed" | "failed";

type WorkflowRunListItem = {
  id: string;
  shortId: string;
  status: string;
  inputSummary: string | null;
  outputSummary: string | null;
  chatId: string | null;
  stepCount: number;
  completedSteps: number;
  currentAgent: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  isActive: boolean;
  ageLabel: string;
};

type WorkflowStepView = {
  id: string;
  stepKey: string;
  agentId: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  error: string | null;
};

type WorkflowEventView = {
  id: string;
  topic: string;
  runId: string | null;
  agentId: string | null;
  createdAt: string;
};

type RunsPayload = {
  enabled: boolean;
  filter: string;
  runs: WorkflowRunListItem[];
  events: WorkflowEventView[];
  snapshot: {
    enabled: boolean;
    activeRunsGlobal: number;
    activeRunsUser: number;
    agents: Array<{
      id: string;
      name: string;
      status: string;
      toolCount: number;
    }>;
  };
};

type RunDetailPayload = {
  run: WorkflowRunListItem;
  planSummary: string | null;
  steps: WorkflowStepView[];
  events: WorkflowEventView[];
};

async function fetchRuns(filter: RunFilter): Promise<RunsPayload> {
  const res = await fetch(
    `${base()}/api/platform/runs?status=${filter}&limit=20`,
    {
      credentials: "include",
    }
  );
  if (!res.ok) {
    throw new Error("Gagal memuat workflow");
  }
  return res.json();
}

async function fetchRunDetail(runId: string): Promise<RunDetailPayload> {
  const res = await fetch(`${base()}/api/platform/runs/${runId}`, {
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error("Workflow tidak ditemukan");
  }
  return res.json();
}

function statusBadgeClass(status: string): string {
  if (status === "completed") {
    return "bg-emerald-500/15 text-emerald-400";
  }
  if (status === "failed" || status === "cancelled") {
    return "bg-red-500/15 text-red-400";
  }
  if (status === "running" || status === "waiting" || status === "pending") {
    return "bg-amber-500/15 text-amber-400";
  }
  return "bg-muted/40 text-muted-foreground";
}

function agentStatusDot(status: string): string {
  if (status === "running") {
    return "bg-amber-400 animate-pulse";
  }
  if (status === "error") {
    return "bg-red-400";
  }
  if (status === "waiting") {
    return "bg-sky-400";
  }
  return "bg-emerald-400/70";
}

function StepIcon({ status }: { status: string }) {
  if (status === "completed") {
    return <CheckCircle2Icon className="size-3.5 text-emerald-400" />;
  }
  if (status === "failed" || status === "cancelled") {
    return <XCircleIcon className="size-3.5 text-red-400" />;
  }
  if (status === "running" || status === "queued" || status === "waiting") {
    return <Loader2Icon className="size-3.5 animate-spin text-amber-400" />;
  }
  return <CircleDotIcon className="size-3.5 text-muted-foreground" />;
}

function topicLabel(topic: string): string {
  const map: Record<string, string> = {
    "workflow.created": "Workflow dibuat",
    "workflow.started": "Workflow mulai",
    "workflow.completed": "Selesai",
    "workflow.failed": "Gagal",
    "step.started": "Step mulai",
    "step.completed": "Step OK",
    "step.failed": "Step gagal",
    "step.retry": "Retry",
  };
  return map[topic] ?? topic;
}

export function PlatformWorkflowPanel() {
  const [filter, setFilter] = useState<RunFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ["platform-runs", filter],
    () => fetchRuns(filter),
    { refreshInterval: 4000 }
  );

  const { data: detail, mutate: mutateDetail } = useSWR(
    selectedRunId ? ["platform-run", selectedRunId] : null,
    () => fetchRunDetail(selectedRunId!),
    { refreshInterval: selectedRunId ? 3000 : 0 }
  );

  const refreshAll = useCallback(() => {
    void mutate();
    if (selectedRunId) {
      void mutateDetail();
    }
  }, [mutate, mutateDetail, selectedRunId]);

  useEffect(() => {
    if (!data?.enabled) {
      return;
    }
    const es = new EventSource(`${base()}/api/platform/events/live`);
    es.onmessage = () => {
      refreshAll();
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [data?.enabled, refreshAll]);

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
        Gagal memuat dashboard workflow.
      </div>
    );
  }

  if (!data?.enabled) {
    return (
      <div className="rounded-xl border border-border/40 bg-card/30 p-6 text-center">
        <WorkflowIcon className="mx-auto mb-2 size-8 text-muted-foreground" />
        <p className="font-medium text-sm">Multi-Agent Platform V2 nonaktif</p>
        <p className="mt-1 text-muted-foreground text-xs">
          Set <code className="text-[11px]">PLATFORM_V2_ENABLED=true</code> di
          .env.local lalu reload PM2.
        </p>
      </div>
    );
  }

  const { runs, events, snapshot } = data;
  const filters: { id: RunFilter; label: string }[] = [
    { id: "active", label: "Aktif" },
    { id: "all", label: "Semua" },
    { id: "completed", label: "Selesai" },
    { id: "failed", label: "Gagal" },
  ];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <WorkflowIcon className="size-4 text-primary" />
            <h2 className="font-semibold text-sm">Multi-Agent Workflow</h2>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-medium text-[10px] text-emerald-400">
              LIVE
            </span>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            {snapshot.activeRunsUser} aktif (kamu) · {snapshot.activeRunsGlobal}{" "}
            global · {snapshot.agents.length} agent · SSE + poll 4 dtk
          </p>
        </div>
        <Button
          className="h-8 text-xs"
          disabled={isValidating}
          onClick={() => refreshAll()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RefreshCwIcon
            className={cn("size-3.5", isValidating && "animate-spin")}
          />
          Muat ulang
        </Button>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {snapshot.agents.map((agent) => (
          <div
            className="rounded-lg border border-border/40 bg-card/30 px-3 py-2"
            key={agent.id}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  agentStatusDot(agent.status)
                )}
              />
              <span className="truncate font-medium text-xs">{agent.name}</span>
            </div>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {agent.id} · {agent.toolCount} tools · {agent.status}
            </p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/40 bg-card/20 p-1">
        {filters.map(({ id, label }) => (
          <Button
            className={cn("h-8 text-xs", filter === id && "bg-primary/15")}
            key={id}
            onClick={() => {
              setFilter(id);
              setSelectedRunId(null);
            }}
            size="sm"
            type="button"
            variant={filter === id ? "secondary" : "ghost"}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Runs list */}
        <div className="space-y-2 lg:col-span-2">
          <h3 className="font-medium text-xs text-muted-foreground uppercase tracking-wide">
            Workflow runs
          </h3>
          {runs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/50 p-4 text-center text-muted-foreground text-xs">
              Belum ada workflow. Coba pesan seperti &quot;cek status server dan
              scan codebase&quot; di chat.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {runs.map((run) => (
                <li key={run.id}>
                  <button
                    className={cn(
                      "w-full rounded-lg border border-border/40 bg-card/30 p-3 text-left transition-colors hover:bg-card/50",
                      selectedRunId === run.id &&
                        "border-primary/40 bg-primary/5"
                    )}
                    onClick={() => setSelectedRunId(run.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {run.shortId}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-medium text-[10px]",
                          statusBadgeClass(run.status)
                        )}
                      >
                        {run.status}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs">
                      {run.inputSummary ?? "—"}
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>
                        {run.completedSteps}/{run.stepCount} step
                      </span>
                      {run.currentAgent ? (
                        <span className="text-amber-400/90">
                          → {run.currentAgent}
                        </span>
                      ) : null}
                      <span className="ml-auto">{run.ageLabel}</span>
                    </div>
                    {run.stepCount > 0 ? (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/30">
                        <div
                          className="h-full rounded-full bg-primary/70 transition-all"
                          style={{
                            width: `${Math.round((run.completedSteps / run.stepCount) * 100)}%`,
                          }}
                        />
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail + events */}
        <div className="space-y-4 lg:col-span-3">
          {selectedRunId && detail ? (
            <div className="rounded-xl border border-border/40 bg-card/30 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {detail.run.id}
                  </p>
                  <p className="mt-1 font-medium text-sm">
                    {detail.planSummary ?? detail.run.inputSummary}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 font-medium text-[10px]",
                    statusBadgeClass(detail.run.status)
                  )}
                >
                  {detail.run.status}
                </span>
              </div>

              <h4 className="mt-4 mb-2 font-medium text-xs text-muted-foreground">
                Pipeline agent
              </h4>
              <ol className="space-y-2">
                {detail.steps.map((step) => (
                  <li
                    className="flex items-start gap-2 rounded-lg border border-border/30 bg-background/40 px-3 py-2"
                    key={step.id}
                  >
                    <StepIcon status={step.status} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        <span className="font-medium">{step.agentId}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          · {step.stepKey}
                        </span>
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {step.status}
                        {step.attempt > 1
                          ? ` · attempt ${step.attempt}/${step.maxAttempts}`
                          : ""}
                      </p>
                      {step.error ? (
                        <p className="mt-1 text-[10px] text-red-400">
                          {step.error}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>

              {detail.run.error ? (
                <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-red-400 text-xs">
                  {detail.run.error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex min-h-[8rem] items-center justify-center rounded-xl border border-dashed border-border/50 p-6 text-center text-muted-foreground text-xs">
              <div>
                <BotIcon className="mx-auto mb-2 size-6 opacity-40" />
                Pilih workflow di kiri untuk lihat pipeline agent
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 flex items-center gap-1.5 font-medium text-xs text-muted-foreground uppercase tracking-wide">
              <ActivityIcon className="size-3.5" />
              Event live
            </h3>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-card/20 p-2">
              {(detail?.events.length ? detail.events : events).length === 0 ? (
                <li className="py-4 text-center text-muted-foreground text-xs">
                  Belum ada event
                </li>
              ) : (
                (detail?.events.length ? detail.events : events)
                  .slice(-15)
                  .reverse()
                  .map((ev) => (
                    <li
                      className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-muted/20"
                      key={ev.id}
                    >
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(ev.createdAt).toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </span>
                      <span className="truncate">{topicLabel(ev.topic)}</span>
                      {ev.agentId ? (
                        <span className="ml-auto shrink-0 text-primary/80">
                          {ev.agentId}
                        </span>
                      ) : null}
                    </li>
                  ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
