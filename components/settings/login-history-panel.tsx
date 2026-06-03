"use client";

import {
  GlobeIcon,
  Loader2Icon,
  LogOutIcon,
  MapPinIcon,
  MonitorIcon,
} from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type LoginEntry = {
  id: string;
  sid: string | null;
  ip: string;
  userAgent: string | null;
  locationLabel: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  loggedInAt: string;
  active: boolean;
  current: boolean;
};

type LoginHistoryPayload = {
  currentSid: string | null;
  entries: LoginEntry[];
};

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "Perangkat tidak diketahui";
  if (/iPhone|iPad/i.test(userAgent)) return "iPhone / iPad";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Peramban web";
}

async function fetchHistory(): Promise<LoginHistoryPayload> {
  const res = await fetch(`${base()}/api/settings/login-history`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Gagal memuat riwayat login");
  }
  return res.json();
}

export function LoginHistoryPanel() {
  const { data, mutate, isLoading } = useSWR(
    "login-history",
    fetchHistory,
    { refreshInterval: 30_000 }
  );
  const [revokeSid, setRevokeSid] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [revoking, setRevoking] = useState(false);

  const revoke = useCallback(async () => {
    if (!revokeSid || pin.length !== 4) return;
    setRevoking(true);
    try {
      const res = await fetch(`${base()}/api/settings/login-history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sid: revokeSid, currentPin: pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ type: "error", description: body.error ?? "Gagal mengakhiri sesi" });
        return;
      }
      toast({ type: "success", description: "Sesi diakhiri" });
      setRevokeSid(null);
      setPin("");
      await mutate();
    } finally {
      setRevoking(false);
    }
  }, [revokeSid, pin, mutate]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        Memuat riwayat login…
      </div>
    );
  }

  const entries = data?.entries ?? [];

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <MonitorIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Riwayat login</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Setiap login PIN tercatat dengan IP, waktu, dan perkiraan lokasi.
        Hanya satu perangkat aktif: login di HP/PC baru otomatis logout
        perangkat lama dalam ±20 detik.
      </p>

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">Belum ada riwayat login.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              className="rounded-lg border border-border/30 bg-background/40 px-3 py-2.5"
              key={entry.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {formatWhen(entry.loggedInAt)}
                    {entry.current && (
                      <span className="ml-2 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Sesi ini
                      </span>
                    )}
                    {entry.active && !entry.current && (
                      <span className="ml-2 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        Aktif
                      </span>
                    )}
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <GlobeIcon className="size-3 shrink-0" />
                    <span className="font-mono">{entry.ip}</span>
                    <span>·</span>
                    <span>{deviceLabel(entry.userAgent)}</span>
                  </p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPinIcon className="size-3 shrink-0" />
                    {entry.locationLabel ??
                      ([entry.city, entry.region, entry.country]
                        .filter(Boolean)
                        .join(", ") || "Lokasi tidak diketahui")}
                  </p>
                </div>
                {entry.active && entry.sid && !entry.current && (
                  <Button
                    onClick={() => {
                      setRevokeSid(entry.sid);
                      setPin("");
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <LogOutIcon className="size-3.5" />
                    Akhiri
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {revokeSid && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Masukkan PIN untuk mengakhiri sesi di perangkat lain.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              autoComplete="off"
              className="max-w-[8rem] font-mono tracking-widest"
              inputMode="numeric"
              maxLength={4}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              type="password"
              value={pin}
            />
            <Button
              disabled={pin.length !== 4 || revoking}
              onClick={revoke}
              size="sm"
              type="button"
            >
              {revoking ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                "Konfirmasi"
              )}
            </Button>
            <Button
              onClick={() => {
                setRevokeSid(null);
                setPin("");
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
