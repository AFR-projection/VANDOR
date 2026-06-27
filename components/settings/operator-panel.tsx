"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  CheckIcon,
  CpuIcon,
  HardDriveIcon,
  Loader2Icon,
  MemoryStickIcon,
  PowerIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { apiBasePath } from "@/lib/app-url";
import { cn } from "@/lib/utils";

const base = apiBasePath;

type Overview = {
  state: {
    mode: "autonomous" | "manual";
    killSwitch: boolean;
    status: string;
    tickCount: number;
    lastHeartbeatAt: string | null;
  };
  metrics: {
    latest: {
      cpuPct: number | null;
      memUsedPct: number | null;
      diskUsedPct: number | null;
      load1x100: number | null;
      uptimeSec: number | null;
    } | null;
    series: { id: string; cpuPct: number | null; memUsedPct: number | null }[];
  };
  tasks: {
    id: string;
    type: string;
    title: string;
    status: string;
    createdAt: string;
  }[];
  actions: {
    id: string;
    tool: string;
    action: string;
    status: string;
    riskLevel: string;
    reason: string | null;
    createdAt: string;
  }[];
  approvals: {
    id: string;
    actionType: string;
    summary: string;
    riskLevel: string;
    createdAt: string;
  }[];
  events: {
    id: string;
    type: string;
    severity: string;
    source: string;
    message: string;
    createdAt: string;
  }[];
  notifications: {
    id: string;
    level: string;
    title: string;
    status: string;
    createdAt: string;
  }[];
};

async function fetchOverview(): Promise<Overview> {
  const res = await fetch(`${base()}/api/agent/overview`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Gagal memuat data Operator");
  }
  return res.json();
}

function timeAgo(iso: string | null): string {
  if (!iso) {
    return "—";
  }
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) {
    return `${s}d lalu`;
  }
  const m = Math.round(s / 60);
  if (m < 60) {
    return `${m}m lalu`;
  }
  return `${Math.round(m / 60)}j lalu`;
}

function formatUptime(sec: number | null): string {
  if (!sec) {
    return "—";
  }
  const h = Math.floor(sec / 3600);
  if (h < 24) {
    return `${h}j`;
  }
  return `${Math.floor(h / 24)}h ${h % 24}j`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  pct,
  tone,
}: {
  icon: typeof CpuIcon;
  label: string;
  value: string;
  pct?: number | null;
  tone?: "ok" | "warn" | "crit";
}) {
  const toneColor =
    tone === "crit"
      ? "text-red-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-emerald-400";
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={cn("mt-1 font-semibold text-lg", toneColor)}>{value}</div>
      {pct != null && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full",
              tone === "crit"
                ? "bg-red-400"
                : tone === "warn"
                  ? "bg-amber-400"
                  : "bg-emerald-400"
            )}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      )}
    </div>
  );
}

function tone(pct: number | null | undefined): "ok" | "warn" | "crit" {
  if (pct == null) {
    return "ok";
  }
  if (pct >= 95) {
    return "crit";
  }
  if (pct >= 85) {
    return "warn";
  }
  return "ok";
}

export function OperatorPanel() {
  const { data, isLoading, mutate, isValidating } = useSWR(
    "agent-overview",
    fetchOverview,
    { refreshInterval: 5000 }
  );
  const [busy, setBusy] = useState(false);

  const control = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/agent/control`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("Gagal");
      }
      await mutate();
      toast({ type: "success", description: "Diterapkan" });
    } catch {
      toast({ type: "error", description: "Gagal mengubah status agent" });
    } finally {
      setBusy(false);
    }
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/agent/approvals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      if (!res.ok) {
        throw new Error("Gagal");
      }
      await mutate();
      toast({
        type: "success",
        description: decision === "approved" ? "Disetujui" : "Ditolak",
      });
    } catch {
      toast({ type: "error", description: "Gagal memproses approval" });
    } finally {
      setBusy(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { state, metrics, approvals, actions, events, tasks } = data;
  const m = metrics.latest;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BotIcon className="size-4 text-primary" />
            <h2 className="font-semibold text-sm">VANDOR Operator</h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium text-[10px]",
                state.killSwitch
                  ? "bg-red-500/15 text-red-400"
                  : state.status === "healthy"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
              )}
            >
              {state.killSwitch ? "DIHENTIKAN" : state.status}
            </span>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Tick #{state.tickCount} · heartbeat {timeAgo(state.lastHeartbeatAt)}{" "}
            · auto-refresh 5 dtk
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-8 text-xs"
            disabled={isValidating}
            onClick={() => mutate()}
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
      </div>

      {/* Kontrol mode + kill switch */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/30 p-3">
        <span className="text-xs text-muted-foreground">Mode:</span>
        <Button
          className="h-8 text-xs"
          disabled={busy || state.killSwitch}
          onClick={() =>
            control({
              mode: state.mode === "autonomous" ? "manual" : "autonomous",
            })
          }
          size="sm"
          type="button"
          variant={state.mode === "autonomous" ? "default" : "outline"}
        >
          {state.mode === "autonomous" ? "Autonomous" : "Manual"}
        </Button>
        <div className="flex-1" />
        <Button
          className={cn(
            "h-8 text-xs",
            state.killSwitch &&
              "border-red-500/40 bg-red-500/10 text-red-400"
          )}
          disabled={busy}
          onClick={() => control({ killSwitch: !state.killSwitch })}
          size="sm"
          type="button"
          variant="outline"
        >
          <PowerIcon className="size-3.5" />
          {state.killSwitch ? "Aktifkan lagi" : "Kill switch"}
        </Button>
      </div>

      {/* Metrik */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard
          icon={CpuIcon}
          label="CPU"
          pct={m?.cpuPct}
          tone={tone(m?.cpuPct)}
          value={m?.cpuPct == null ? "—" : `${m.cpuPct}%`}
        />
        <MetricCard
          icon={MemoryStickIcon}
          label="RAM"
          pct={m?.memUsedPct}
          tone={tone(m?.memUsedPct)}
          value={m?.memUsedPct == null ? "—" : `${m.memUsedPct}%`}
        />
        <MetricCard
          icon={HardDriveIcon}
          label="Disk"
          pct={m?.diskUsedPct}
          tone={tone(m?.diskUsedPct)}
          value={m?.diskUsedPct == null ? "—" : `${m.diskUsedPct}%`}
        />
        <MetricCard
          icon={ActivityIcon}
          label="Uptime"
          value={formatUptime(m?.uptimeSec ?? null)}
        />
      </div>

      {/* Approval pending */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlertIcon className="size-4 text-amber-400" />
          <h3 className="font-semibold text-sm">
            Persetujuan ({approvals.length})
          </h3>
        </div>
        {approvals.length === 0 ? (
          <p className="rounded-lg border border-border/40 bg-card/20 p-3 text-muted-foreground text-xs">
            Tidak ada aksi menunggu persetujuan.
          </p>
        ) : (
          <ul className="space-y-2">
            {approvals.map((a) => (
              <li
                className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3"
                key={a.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] text-amber-400 uppercase">
                      {a.riskLevel}
                    </span>
                    <p className="mt-1 break-words text-xs">{a.summary}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {timeAgo(a.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                      disabled={busy}
                      onClick={() => decide(a.id, "approved")}
                      size="sm"
                      type="button"
                    >
                      <CheckIcon className="size-3.5" />
                    </Button>
                    <Button
                      className="h-7 text-xs"
                      disabled={busy}
                      onClick={() => decide(a.id, "rejected")}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Event + Audit */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Event terbaru</h3>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border/40 bg-card/20 p-2">
            {events.length === 0 ? (
              <p className="p-2 text-muted-foreground text-xs">
                Belum ada event.
              </p>
            ) : (
              events.map((e) => (
                <div className="text-xs" key={e.id}>
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      e.severity === "critical" || e.severity === "error"
                        ? "text-red-400"
                        : e.severity === "warn"
                          ? "text-amber-400"
                          : "text-sky-400"
                    )}
                  >
                    [{e.source}]
                  </span>{" "}
                  <span className="text-foreground/90">{e.message}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {timeAgo(e.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ActivityIcon className="size-4 text-primary" />
            <h3 className="font-semibold text-sm">Audit aksi</h3>
          </div>
          <div className="max-h-64 space-y-1.5 overflow-y-auto rounded-lg border border-border/40 bg-card/20 p-2">
            {actions.length === 0 ? (
              <p className="p-2 text-muted-foreground text-xs">
                Belum ada aksi.
              </p>
            ) : (
              actions.map((a) => (
                <div className="text-xs" key={a.id}>
                  <span
                    className={cn(
                      "font-mono text-[10px]",
                      a.status === "error"
                        ? "text-red-400"
                        : a.status === "pending"
                          ? "text-amber-400"
                          : "text-emerald-400"
                    )}
                  >
                    {a.tool}.{a.action}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {a.reason ?? a.status}
                  </span>
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    {timeAgo(a.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Task queue */}
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Task queue</h3>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/40 bg-card/20 p-2">
          {tasks.length === 0 ? (
            <p className="p-2 text-muted-foreground text-xs">Kosong.</p>
          ) : (
            tasks.map((t) => (
              <div
                className="flex items-center justify-between text-xs"
                key={t.id}
              >
                <span className="truncate text-foreground/90">{t.title}</span>
                <span
                  className={cn(
                    "ml-2 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]",
                    t.status === "failed"
                      ? "bg-red-500/15 text-red-400"
                      : t.status === "done"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {t.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
