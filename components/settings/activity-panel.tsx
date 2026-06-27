"use client";

import {
  Loader2Icon,
  RefreshCwIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

type LogLevel = "info" | "warn" | "error" | "success";

type ActivityLogRow = {
  id: string;
  source: string;
  level: LogLevel;
  message: string;
  status: "ok" | "error";
  durationMs: number | null;
  detail: string | null;
  chatId: string | null;
  createdAt: string;
};

type LogFilter = "all" | LogLevel;

async function fetchLogs(): Promise<{ events: ActivityLogRow[] }> {
  const res = await fetch(`${base()}/api/settings/activity?limit=100`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Gagal memuat log server");
  }
  return res.json();
}

function formatLogTime(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));
}

function levelStyles(level: LogLevel): string {
  switch (level) {
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    case "success":
      return "text-emerald-400";
    default:
      return "text-sky-300";
  }
}

function levelPrefix(level: LogLevel): string {
  switch (level) {
    case "error":
      return "ERR";
    case "warn":
      return "WRN";
    case "success":
      return " OK";
    default:
      return "INF";
  }
}

export function ActivityPanel() {
  const { data, isLoading, mutate, isValidating } = useSWR(
    "server-activity-log",
    fetchLogs,
    { refreshInterval: 8000 }
  );
  const [filter, setFilter] = useState<LogFilter>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const events = data?.events ?? [];
  const filtered =
    filter === "all" ? events : events.filter((e) => e.level === filter);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) {
      return;
    }
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [autoScroll, filtered.length, data]);

  const errorCount = events.filter((e) => e.level === "error").length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <TerminalIcon className="size-4 text-primary" />
            <h2 className="font-semibold text-sm">Log server</h2>
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Aktivitas server VANDOR — tool, unduhan media, error chat, dll.
            Auto-refresh setiap 8 detik.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="h-8 text-xs"
            disabled={isLoading || isValidating}
            onClick={() => mutate()}
            size="sm"
            type="button"
            variant="outline"
          >
            {isValidating ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <RefreshCwIcon className="size-3.5" />
            )}
            Muat ulang
          </Button>
          <Button
            className={cn(
              "h-8 text-xs",
              autoScroll && "border-primary/40 bg-primary/10"
            )}
            onClick={() => setAutoScroll((v) => !v)}
            size="sm"
            type="button"
            variant="outline"
          >
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "Semua"],
            ["error", `Error (${errorCount})`],
            ["success", "Sukses"],
            ["warn", "Peringatan"],
            ["info", "Info"],
          ] as const
        ).map(([id, label]) => (
          <button
            className={cn(
              "rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors",
              filter === id
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground"
            )}
            key={id}
            onClick={() => setFilter(id)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#30363d] bg-[#0d1117] shadow-inner">
        <div className="flex items-center gap-2 border-[#30363d] border-b bg-[#161b22] px-3 py-2">
          <span className="size-2.5 rounded-full bg-red-500/90" />
          <span className="size-2.5 rounded-full bg-amber-400/90" />
          <span className="size-2.5 rounded-full bg-emerald-400/90" />
          <span className="ml-2 font-mono text-[#8b949e] text-[11px]">
            vandor@server — ~/logs/activity.log
          </span>
        </div>

        <div
          className="h-[min(420px,55vh)] overflow-y-auto p-3 font-mono text-[11px] leading-relaxed"
          ref={scrollRef}
        >
          {isLoading && (
            <div className="flex items-center gap-2 text-[#8b949e]">
              <Loader2Icon className="size-3.5 animate-spin" />
              Memuat log…
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-[#8b949e]">
              {filter === "all"
                ? "Belum ada log. Jalankan chat, unduh media (/tt), atau tool lain."
                : `Tidak ada log dengan level "${filter}".`}
            </p>
          )}

          {filtered.map((entry) => (
            <div className="mb-2" key={entry.id}>
              <div
                className={cn(
                  "whitespace-pre-wrap break-words",
                  levelStyles(entry.level)
                )}
              >
                <span className="text-[#6e7681]">
                  [{formatLogTime(entry.createdAt)}]
                </span>{" "}
                <span className="text-[#d2a8ff]">
                  {levelPrefix(entry.level)}
                </span>{" "}
                <span className="text-[#79c0ff]">{entry.source}</span>
                <span className="text-[#c9d1d9]"> — {entry.message}</span>
                {entry.durationMs != null && (
                  <span className="text-[#8b949e]">
                    {" "}
                    ({entry.durationMs}ms)
                  </span>
                )}
              </div>
              {entry.detail && (
                <pre className="mt-0.5 ml-4 whitespace-pre-wrap break-words text-[#8b949e]">
                  {entry.detail}
                </pre>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-[#30363d] border-t bg-[#161b22] px-3 py-1.5 font-mono text-[#6e7681] text-[10px]">
          <span>
            {filtered.length} baris
            {filter !== "all" ? ` (filter: ${filter})` : ""}
          </span>
          <span className="flex items-center gap-1">
            <Trash2Icon className="size-3 opacity-50" />
            log disimpan di database (100 terakhir)
          </span>
        </div>
      </div>
    </section>
  );
}
