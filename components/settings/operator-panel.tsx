"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  BotIcon,
  CheckIcon,
  CpuIcon,
  DownloadIcon,
  HardDriveIcon,
  Loader2Icon,
  MemoryStickIcon,
  PlusIcon,
  PowerIcon,
  RefreshCwIcon,
  RocketIcon,
  SendIcon,
  ShieldAlertIcon,
  TargetIcon,
  TerminalIcon,
  TimerIcon,
  XIcon,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiBasePath } from "@/lib/app-url";
import { cn } from "@/lib/utils";

const base = apiBasePath;

type Tab = "overview" | "goals" | "rules" | "schedules";

type Overview = {
  state: {
    mode: "autonomous" | "manual";
    killSwitch: boolean;
    status: string;
    tickCount: number;
    lastHeartbeatAt: string | null;
    note?: string | null;
  };
  heartbeat: {
    healthScore: number;
    grade: string;
    summary: string;
    subsystems: {
      worker: string;
      web: string;
      whatsapp: string;
      database: string;
    };
    metrics: {
      cpuPct: number;
      memUsedPct: number;
      diskUsedPct: number | null;
      servicesDown: number;
    };
    tickDurationMs: number;
    autoFix: {
      lastAt: string | null;
      lastSuccess: boolean | null;
      lastSummary: string | null;
    };
  } | null;
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
  goals: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: number;
    createdAt: string;
  }[];
  rules: {
    id: string;
    name: string;
    kind: string;
    pattern: string;
    riskLevel: string;
    enabled: boolean;
    priority: number;
  }[];
  schedules: {
    id: string;
    name: string;
    kind: string;
    expression: string;
    taskType: string;
    enabled: boolean;
    lastRunAt: string | null;
  }[];
  terminal: {
    id: string;
    sessionId: string;
    stream: string;
    line: string;
    level: string;
    command: string | null;
    exitCode: number | null;
    createdAt: string | null;
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

function MetricsChart({
  series,
  field,
  label,
  color,
}: {
  series: { cpuPct: number | null; memUsedPct: number | null }[];
  field: "cpuPct" | "memUsedPct";
  label: string;
  color: string;
}) {
  const points = series
    .map((row, i) => {
      const v = row[field];
      if (v == null) {
        return null;
      }
      const x = series.length <= 1 ? 0 : (i / (series.length - 1)) * 100;
      const y = 100 - Math.min(100, Math.max(0, v));
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(" ");

  if (!points) {
    return (
      <p className="text-muted-foreground text-xs">Belum ada data {label}.</p>
    );
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card/30 p-3">
      <p className="mb-2 text-muted-foreground text-xs">{label} (24j)</p>
      <svg
        aria-label={`Grafik ${label}`}
        className="h-16 w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 100"
      >
        <title>{label} 24 jam</title>
        <polyline
          fill="none"
          points={points}
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

export function OperatorPanel() {
  const { data, isLoading, mutate, isValidating } = useSWR(
    "agent-overview",
    fetchOverview,
    { refreshInterval: 5000 }
  );
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [goalTitle, setGoalTitle] = useState("");
  const [ruleDraft, setRuleDraft] = useState({
    name: "",
    pattern: "",
    kind: "require_approval",
  });
  const [cliInput, setCliInput] = useState("");
  const [schedDraft, setSchedDraft] = useState({
    name: "",
    kind: "interval",
    expression: "600",
    taskType: "monitor",
  });

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

  const notifyApprovalsWa = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/agent/approvals/notify`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        ok?: boolean;
        count?: number;
        error?: string;
        sentTo?: number;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Gagal kirim ke WhatsApp");
      }
      toast({
        type: "success",
        description:
          json.count && json.count > 0
            ? `Digest ${json.count} persetujuan dikirim ke WA`
            : "Tidak ada persetujuan pending",
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error
            ? error.message
            : "Gagal mengirim persetujuan ke WhatsApp",
      });
    } finally {
      setBusy(false);
    }
  };

  const agentCli = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/agent/cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        needsApproval?: boolean;
        reason?: string;
        summary?: string;
        sessionId?: string;
        taskId?: string;
      };
      if (json.needsApproval) {
        toast({
          type: "error",
          description: json.reason ?? "Perintah butuh approval",
        });
        return;
      }
      if (!res.ok) {
        throw new Error(json.error ?? "CLI gagal");
      }
      await mutate();
      toast({
        type: "success",
        description:
          json.summary ??
          (json.sessionId
            ? `Selesai — log session ${json.sessionId.slice(0, 8)}`
            : json.taskId
              ? `Task ${json.taskId.slice(0, 8)} diantrikan`
              : "Perintah dijalankan"),
      });
    } catch (error) {
      toast({
        type: "error",
        description:
          error instanceof Error ? error.message : "Gagal menjalankan CLI",
      });
    } finally {
      setBusy(false);
    }
  };

  const postJson = async (url: string, body: Record<string, unknown>) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error("Gagal");
    }
    await mutate();
  };

  const addGoal = async () => {
    if (goalTitle.trim().length < 3) {
      return;
    }
    setBusy(true);
    try {
      await postJson(`${base()}/api/agent/goals`, { title: goalTitle.trim() });
      setGoalTitle("");
      toast({ type: "success", description: "Goal ditambahkan" });
    } catch {
      toast({ type: "error", description: "Gagal menambah goal" });
    } finally {
      setBusy(false);
    }
  };

  const addRule = async () => {
    if (!ruleDraft.name.trim() || !ruleDraft.pattern.trim()) {
      return;
    }
    setBusy(true);
    try {
      await postJson(`${base()}/api/agent/rules`, ruleDraft);
      setRuleDraft({ name: "", pattern: "", kind: "require_approval" });
      toast({ type: "success", description: "Rule ditambahkan" });
    } catch {
      toast({ type: "error", description: "Gagal menambah rule" });
    } finally {
      setBusy(false);
    }
  };

  const addSchedule = async () => {
    if (!schedDraft.name.trim()) {
      return;
    }
    setBusy(true);
    try {
      await postJson(`${base()}/api/agent/schedules`, schedDraft);
      toast({ type: "success", description: "Jadwal ditambahkan" });
    } catch {
      toast({ type: "error", description: "Gagal menambah jadwal" });
    } finally {
      setBusy(false);
    }
  };

  const requestDeploy = async () => {
    setBusy(true);
    try {
      await postJson(`${base()}/api/agent/schedules`, { action: "deploy" });
      toast({
        type: "success",
        description: "Deploy diminta — tunggu approval",
      });
    } catch {
      toast({ type: "error", description: "Gagal meminta deploy" });
    } finally {
      setBusy(false);
    }
  };

  const exportMetrics = () => {
    if (!data?.metrics.series.length) {
      return;
    }
    const blob = new Blob([JSON.stringify(data.metrics.series, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vandor-metrics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { state, heartbeat, metrics, approvals, actions, events, tasks, goals, rules, schedules, terminal } =
    data;
  const m = metrics.latest;
  const hb = heartbeat;

  const tabs: { id: Tab; label: string; icon: typeof BotIcon }[] = [
    { id: "overview", label: "Overview", icon: ActivityIcon },
    { id: "goals", label: "Goals", icon: TargetIcon },
    { id: "rules", label: "Rules", icon: ShieldAlertIcon },
    { id: "schedules", label: "Jadwal", icon: TimerIcon },
  ];

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
            Tick #{state.tickCount}
            {hb ? (
              <>
                {" "}
                · skor{" "}
                <span
                  className={cn(
                    hb.healthScore >= 75
                      ? "text-emerald-400"
                      : hb.healthScore >= 50
                        ? "text-amber-400"
                        : "text-red-400"
                  )}
                >
                  {hb.healthScore}/100
                </span>{" "}
                ({hb.grade})
              </>
            ) : null}{" "}
            · heartbeat {timeAgo(state.lastHeartbeatAt)}{" "}
            {hb ? `· ${hb.tickDurationMs}ms/tick` : ""} · auto-refresh 5 dtk
          </p>
          {hb?.summary ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground/90">
              {hb.summary}
            </p>
          ) : null}
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

      <div className="flex flex-wrap gap-1 rounded-lg border border-border/40 bg-card/20 p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <Button
            className={cn("h-8 text-xs", tab === id && "bg-primary/15")}
            key={id}
            onClick={() => setTab(id)}
            size="sm"
            type="button"
            variant={tab === id ? "secondary" : "ghost"}
          >
            <Icon className="size-3.5" />
            {label}
          </Button>
        ))}
        <div className="flex-1" />
        <Button
          className="h-8 text-xs"
          disabled={busy}
          onClick={() => requestDeploy()}
          size="sm"
          type="button"
          variant="outline"
        >
          <RocketIcon className="size-3.5" />
          Deploy
        </Button>
      </div>

      {tab === "goals" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              className="h-9 text-xs"
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder="Goal jangka panjang (mis. uptime 99.9%)"
              value={goalTitle}
            />
            <Button
              className="h-9 shrink-0"
              disabled={busy || goalTitle.trim().length < 3}
              onClick={() => addGoal()}
              size="sm"
              type="button"
            >
              <PlusIcon className="size-3.5" />
              Tambah
            </Button>
          </div>
          <ul className="space-y-2">
            {goals.map((g) => (
              <li
                className="rounded-lg border border-border/40 bg-card/20 p-3 text-xs"
                key={g.id}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-medium">{g.title}</span>
                    <p className="mt-0.5 text-muted-foreground">
                      P{g.priority} · {g.status}
                    </p>
                  </div>
                  {g.status === "active" && (
                    <Button
                      className="h-7 text-[10px]"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await fetch(`${base()}/api/agent/goals`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: g.id, status: "paused" }),
                          });
                          await mutate();
                        } finally {
                          setBusy(false);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Pause
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "rules" && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              className="h-9 text-xs"
              onChange={(e) =>
                setRuleDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder="Nama rule"
              value={ruleDraft.name}
            />
            <Input
              className="h-9 font-mono text-xs"
              onChange={(e) =>
                setRuleDraft((d) => ({ ...d, pattern: e.target.value }))
              }
              placeholder="Regex pattern"
              value={ruleDraft.pattern}
            />
            <Button
              className="h-9"
              disabled={busy}
              onClick={() => addRule()}
              size="sm"
              type="button"
            >
              <PlusIcon className="size-3.5" />
              Rule baru
            </Button>
          </div>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {rules.map((r) => (
              <li
                className="flex items-center justify-between rounded border border-border/30 px-2 py-1.5 text-xs"
                key={r.id}
              >
                <span>
                  <span className="font-mono text-[10px] text-primary">
                    [{r.kind}]
                  </span>{" "}
                  {r.name}
                </span>
                <span className="text-muted-foreground">
                  {r.enabled ? "on" : "off"} · P{r.priority}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "schedules" && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <Input
              className="h-9 text-xs"
              onChange={(e) =>
                setSchedDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder="Nama"
              value={schedDraft.name}
            />
            <Input
              className="h-9 text-xs"
              onChange={(e) =>
                setSchedDraft((d) => ({ ...d, expression: e.target.value }))
              }
              placeholder="interval detik / cron"
              value={schedDraft.expression}
            />
            <Input
              className="h-9 text-xs"
              onChange={(e) =>
                setSchedDraft((d) => ({ ...d, taskType: e.target.value }))
              }
              placeholder="task type"
              value={schedDraft.taskType}
            />
            <Button
              className="h-9"
              disabled={busy}
              onClick={() => addSchedule()}
              size="sm"
              type="button"
            >
              <PlusIcon className="size-3.5" />
              Jadwal
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            interval: detik (120=2mnt). cron: 5-field (*/30 * * * * = tiap 30
            mnt).
          </p>
          <ul className="space-y-1.5">
            {schedules.map((s) => (
              <li
                className="flex items-center justify-between rounded border border-border/30 px-2 py-1.5 text-xs"
                key={s.id}
              >
                <span>
                  {s.name}{" "}
                  <span className="text-muted-foreground">
                    ({s.kind}:{s.expression} → {s.taskType})
                  </span>
                </span>
                <Button
                  className="h-7 text-[10px]"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await postJson(`${base()}/api/agent/schedules`, {
                        action: "trigger",
                        id: s.id,
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Run
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "overview" && (
        <>
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

      {hb ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Worker", hb.subsystems.worker],
              ["Web", hb.subsystems.web],
              ["WhatsApp", hb.subsystems.whatsapp],
              ["Database", hb.subsystems.database],
            ] as const
          ).map(([label, status]) => (
            <div
              className="rounded-lg border border-border/40 bg-card/25 px-3 py-2"
              key={label}
            >
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                {label}
              </p>
              <p
                className={cn(
                  "mt-0.5 font-medium text-xs capitalize",
                  status === "ok"
                    ? "text-emerald-400"
                    : status === "warn"
                      ? "text-amber-400"
                      : "text-red-400"
                )}
              >
                {status}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
          <MetricsChart
            color="#34d399"
            field="cpuPct"
            label="CPU"
            series={metrics.series}
          />
          <MetricsChart
            color="#60a5fa"
            field="memUsedPct"
            label="RAM"
            series={metrics.series}
          />
        </div>
        <Button
          className="h-8 shrink-0 text-xs"
          onClick={() => exportMetrics()}
          size="sm"
          type="button"
          variant="outline"
        >
          <DownloadIcon className="size-3.5" />
          Export
        </Button>
      </div>

      {/* Approval pending */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlertIcon className="size-4 text-amber-400" />
            <h3 className="font-semibold text-sm">
              Persetujuan ({approvals.length})
            </h3>
          </div>
          {approvals.length > 0 ? (
            <Button
              className="h-7 gap-1.5 text-xs"
              disabled={busy}
              onClick={notifyApprovalsWa}
              size="sm"
              type="button"
              variant="outline"
            >
              <SendIcon className="size-3.5" />
              Kirim ke WA
            </Button>
          ) : null}
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

      {/* Terminal nyata — output CLI tersimpan di DB */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-emerald-400" />
            <h3 className="font-semibold text-sm">Terminal Agent</h3>
            <span className="text-[10px] text-muted-foreground">
              output nyata · refresh 5s
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => agentCli({ action: "enqueue_scan" })}
              size="sm"
              type="button"
              variant="outline"
            >
              Scan code
            </Button>
            <Button
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => agentCli({ action: "enqueue_scan", fullBuild: true })}
              size="sm"
              type="button"
              variant="outline"
            >
              Scan + build
            </Button>
            <Button
              className="h-7 text-xs"
              disabled={busy}
              onClick={() => agentCli({ action: "enqueue_fix" })}
              size="sm"
              type="button"
              variant="outline"
            >
              Analisis bug
            </Button>
          </div>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const cmd = cliInput.trim();
            if (!cmd) {
              return;
            }
            void agentCli({ command: cmd }).then(() => setCliInput(""));
          }}
        >
          <Input
            className="h-8 font-mono text-xs"
            disabled={busy}
            onChange={(e) => setCliInput(e.target.value)}
            placeholder="pm2 jlist · git status · df -h"
            value={cliInput}
          />
          <Button className="h-8 shrink-0" disabled={busy || !cliInput.trim()} type="submit">
            Jalankan
          </Button>
        </form>
        <div className="max-h-72 overflow-y-auto rounded-lg border border-emerald-500/20 bg-black/80 p-3 font-mono text-[11px] leading-relaxed text-emerald-100/90">
          {terminal.length === 0 ? (
            <p className="text-muted-foreground">
              Belum ada log. Jalankan{" "}
              <code className="text-emerald-400">npm run agent:cli -- status</code>{" "}
              di VPS atau ketik perintah di atas.
            </p>
          ) : (
            [...terminal].reverse().map((row) => (
              <div
                className={cn(
                  "whitespace-pre-wrap break-all",
                  row.level === "cmd" && "text-amber-300",
                  (row.level === "stderr" || row.level === "error") &&
                    "text-red-400",
                  row.level === "info" && "text-sky-300/80"
                )}
                key={row.id}
              >
                {row.level === "cmd" ? "$ " : ""}
                {row.line}
              </div>
            ))
          )}
        </div>
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
        </>
      )}
    </section>
  );
}
