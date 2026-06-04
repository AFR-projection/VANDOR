"use client";

import { ActivityIcon, Loader2Icon } from "lucide-react";
import useSWR from "swr";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type ToolEventRow = {
  id: string;
  toolName: string;
  status: "ok" | "error";
  durationMs: number | null;
  detail: string | null;
  createdAt: string;
};

async function fetchActivity(): Promise<{ events: ToolEventRow[] }> {
  const res = await fetch(`${base()}/api/settings/activity`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat aktivitas");
  return res.json();
}

export function ActivityPanel() {
  const { data, isLoading } = useSWR("tool-activity", fetchActivity, {
    refreshInterval: 15_000,
  });

  const events = data?.events ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <ActivityIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Aktivitas tool</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Log 50 eksekusi tool terakhir (PDF, web search, memori, dll.) untuk
        debugging.
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          Memuat…
        </div>
      )}

      {events.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">Belum ada log tool.</p>
      )}

      <ul className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
        {events.map((e) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-md border border-border/20 bg-background/30 px-2 py-1.5"
            key={e.id}
          >
            <span
              className={
                e.status === "ok"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }
            >
              {e.status === "ok" ? "✓" : "✗"}
            </span>
            <span className="font-mono font-medium">{e.toolName}</span>
            <span className="text-muted-foreground">
              {new Intl.DateTimeFormat("id-ID", {
                timeStyle: "short",
                dateStyle: "short",
              }).format(new Date(e.createdAt))}
            </span>
            {e.detail && (
              <span className="w-full truncate text-muted-foreground">
                {e.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
