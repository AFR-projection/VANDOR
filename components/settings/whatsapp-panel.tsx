"use client";

import {
  CheckCircle2Icon,
  ClockIcon,
  CopyIcon,
  KeyRoundIcon,
  Loader2Icon,
  LogOutIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  UserXIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/chat/toast";
import { Button } from "@/components/ui/button";

import { apiBasePath } from "@/lib/app-url";
const base = apiBasePath;

// ─── Types ───────────────────────────────────────────────────────────────────

type WhatsappStatus =
  | "idle"
  | "connecting"
  | "qr"
  | "connected"
  | "logged_out"
  | "error";

type WhatsappState = {
  status: WhatsappStatus;
  qr: string | null;
  me: string | null;
  error: string | null;
  updatedAt: number;
  deployment?: { serverless: boolean };
};

type VerifCode = {
  id: string;
  code: string;
  expiresAt: string;
  usedAt: string | null;
};

type Owner = {
  phone: string;
  label: string | null;
  verifiedAt: string;
};

type LogEntry = {
  id: string;
  event: string;
  phone: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchState(): Promise<WhatsappState> {
  const res = await fetch(`${base()}/api/whatsapp/status`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat status WhatsApp");
  return res.json();
}

async function fetchCodeData(): Promise<{
  active: VerifCode | null;
  logs: LogEntry[];
}> {
  const res = await fetch(`${base()}/api/whatsapp/generate-code`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat kode");
  return res.json();
}

async function fetchOwners(): Promise<{ owners: Owner[] }> {
  const res = await fetch(`${base()}/api/whatsapp/owners`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Gagal memuat owner");
  return res.json();
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(expiresAt: string | null): number {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expiresAt) {
      setRemaining(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<WhatsappStatus, string> = {
  idle: "Belum tersambung",
  connecting: "Menyambungkan…",
  qr: "Menunggu scan QR",
  connected: "Tersambung",
  logged_out: "Keluar",
  error: "Error",
};

const EVENT_LABEL: Record<string, string> = {
  code_generated: "Kode digenerate",
  code_used: "Kode dipakai — owner ditambah",
  code_invalid: "Kode tidak valid",
  code_expired: "Kode kedaluwarsa",
  owner_added: "Owner terdaftar",
  owner_revoked: "Owner dicabut",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WhatsappStatus }) {
  const tone =
    status === "connected"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "error"
        ? "bg-destructive/15 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function VerifCodeCard({
  active,
  onGenerate,
  busy,
}: {
  active: VerifCode | null;
  onGenerate: () => void;
  busy: boolean;
}) {
  const remaining = useCountdown(active?.expiresAt ?? null);
  const pct = active
    ? Math.round(
        (remaining /
          Math.max(
            1,
            Math.floor(
              (new Date(active.expiresAt).getTime() -
                new Date(active.expiresAt).getTime() +
                10 * 60) /
                1
            )
          )) *
          100
      )
    : 0;

  const progressPct = active
    ? Math.round(
        (remaining / 600) * 100
      )
    : 0;

  const isExpired = active ? remaining === 0 : false;

  const copyCode = useCallback(async () => {
    if (!active?.code) return;
    await navigator.clipboard.writeText(active.code);
    toast({ type: "success", description: "Kode disalin!" });
  }, [active?.code]);

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <KeyRoundIcon className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">Kode Verifikasi</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Generate kode unik 10 menit, kirim ke nomor WhatsApp yang ingin
        didaftarkan, lalu nomor tersebut otomatis terdaftar sebagai Owner.
      </p>

      {active && !isExpired ? (
        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-2xl font-bold tracking-[0.25em] text-primary">
              {active.code}
            </span>
            <Button
              onClick={copyCode}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <CopyIcon className="size-3.5" />
              <span className="sr-only">Salin kode</span>
            </Button>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/40">
            <div
              className="h-full rounded-full bg-primary transition-all duration-1000"
              style={{ width: `${Math.max(0, progressPct)}%` }}
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="size-3" />
            <span>
              Kedaluwarsa dalam{" "}
              <span className="font-medium tabular-nums text-foreground">
                {Math.floor(remaining / 60)}:
                {String(remaining % 60).padStart(2, "0")}
              </span>
            </span>
          </div>
          <p className="rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            Kirim kode ini dari HP ke nomor WhatsApp yang sudah tautkan di
            scanner atas. Kode otomatis hangus setelah digunakan.
          </p>
        </div>
      ) : (
        active && isExpired ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            Kode terakhir sudah kedaluwarsa. Generate kode baru.
          </p>
        ) : null
      )}

      <Button
        disabled={busy}
        onClick={onGenerate}
        size="sm"
        type="button"
        variant={active && !isExpired ? "outline" : "default"}
      >
        {busy ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <KeyRoundIcon className="size-3.5" />
        )}
        {active && !isExpired ? "Generate kode baru" : "Generate kode verifikasi"}
      </Button>
    </section>
  );
}

function OwnersCard({
  owners,
  onRevoke,
  busy,
}: {
  owners: Owner[];
  onRevoke: (phone: string) => void;
  busy: boolean;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheckIcon className="size-4 text-emerald-500" />
        <h2 className="text-sm font-semibold">Owner Terverifikasi</h2>
        {owners.length > 0 && (
          <span className="ml-auto rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            {owners.length}
          </span>
        )}
      </div>

      {owners.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center text-xs text-muted-foreground">
          <UserXIcon className="size-8 opacity-30" />
          <p>Belum ada nomor terverifikasi.</p>
          <p>Generate kode di atas lalu kirim dari HP yang ingin didaftarkan.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {owners.map((o) => (
            <li
              className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/50 px-3 py-2"
              key={o.phone}
            >
              <SmartphoneIcon className="size-4 shrink-0 text-emerald-500" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-medium">+{o.phone}</p>
                <p className="text-[10px] text-muted-foreground">
                  Terverifikasi {fmt(o.verifiedAt)}
                  {o.label ? ` · ${o.label}` : ""}
                </p>
              </div>
              <Button
                disabled={busy}
                onClick={() => onRevoke(o.phone)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2Icon className="size-3.5 text-destructive" />
                <span className="sr-only">Cabut akses {o.phone}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AuditLogCard({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) return null;

  const eventColor: Record<string, string> = {
    code_generated: "text-blue-500",
    code_used: "text-emerald-500",
    code_invalid: "text-amber-500",
    code_expired: "text-muted-foreground",
    owner_added: "text-emerald-600",
    owner_revoked: "text-destructive",
  };

  return (
    <section className="space-y-3 rounded-xl border border-border/40 bg-card/30 p-4">
      <h2 className="text-sm font-semibold">Log Aktivitas</h2>
      <ul className="space-y-1.5">
        {logs.map((log) => (
          <li
            className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 text-xs odd:bg-muted/20"
            key={log.id}
          >
            <span
              className={`font-medium ${eventColor[log.event] ?? "text-foreground"}`}
            >
              {EVENT_LABEL[log.event] ?? log.event}
              {log.phone ? (
                <span className="ml-1.5 font-mono font-normal text-muted-foreground">
                  +{log.phone}
                </span>
              ) : null}
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {fmt(log.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function WhatsappPanel() {
  const [waState, setWaState] = useState<WhatsappState | null>(null);
  const [activeCode, setActiveCode] = useState<VerifCode | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [stateRes, codeRes, ownersRes] = await Promise.all([
        fetchState(),
        fetchCodeData(),
        fetchOwners(),
      ]);
      setWaState(stateRes);
      setActiveCode(codeRes.active);
      setLogs(codeRes.logs);
      setOwners(ownersRes.owners);
    } catch {
      // keep last state
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    pollRef.current = setInterval(() => {
      void refreshAll();
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [refreshAll]);

  const connect = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/whatsapp/connect`, {
        method: "POST",
      });
      const json = (await res.json()) as WhatsappState;
      if (!res.ok) throw new Error(json.error ?? "Gagal menyambungkan");
      setWaState(json);
      toast({ type: "success", description: "Menyiapkan sambungan WhatsApp…" });
    } catch (e) {
      toast({
        type: "error",
        description: e instanceof Error ? e.message : "Gagal menyambungkan",
      });
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/whatsapp/logout`, { method: "POST" });
      const json = (await res.json()) as WhatsappState;
      setWaState(json);
      toast({ type: "success", description: "WhatsApp diputus." });
    } catch {
      toast({ type: "error", description: "Gagal memutus WhatsApp" });
    } finally {
      setBusy(false);
    }
  }, []);

  const generateCode = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(`${base()}/api/whatsapp/generate-code`, {
        method: "POST",
      });
      const json = (await res.json()) as { code: VerifCode };
      if (!res.ok) throw new Error("Gagal generate kode");
      setActiveCode(json.code);
      toast({ type: "success", description: "Kode verifikasi baru siap!" });
      void refreshAll();
    } catch (e) {
      toast({
        type: "error",
        description: e instanceof Error ? e.message : "Gagal generate kode",
      });
    } finally {
      setBusy(false);
    }
  }, [refreshAll]);

  const revokeOwner = useCallback(
    async (phone: string) => {
      setBusy(true);
      try {
        const res = await fetch(`${base()}/api/whatsapp/owners`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        if (!res.ok) throw new Error("Gagal mencabut owner");
        toast({ type: "success", description: `+${phone} dicabut.` });
        void refreshAll();
      } catch (e) {
        toast({
          type: "error",
          description: e instanceof Error ? e.message : "Gagal mencabut owner",
        });
      } finally {
        setBusy(false);
      }
    },
    [refreshAll]
  );

  const status = waState?.status ?? "idle";
  const connected = status === "connected";
  const showQr = status === "qr" && waState?.qr;
  const isActivating = busy || status === "connecting";

  return (
    <div className="space-y-5">
      {/* ── Header card ── */}
      {waState?.deployment?.serverless ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs text-amber-800 dark:text-amber-300">
          <p className="font-medium">Host serverless (Vercel)</p>
          <p className="mt-1 text-muted-foreground">
            QR &amp; sesi WhatsApp disimpan terenkripsi di database. Scan QR
            tetap bisa dari sini; untuk bot online 24 jam tanpa putus, jalankan
            VANDOR di host yang selalu nyala (laptop/VPS/Railway) atau pakai
            bridge + secret di tab API &amp; integrasi.
          </p>
        </section>
      ) : null}
      <section className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-card/40 to-emerald-500/5 p-4 sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-emerald-500/15 blur-3xl"
        />
        <div className="relative flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
            <SmartphoneIcon className="size-5 text-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">WhatsApp</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Hubungkan WhatsApp ke VANDOR. Owner terverifikasi bisa mengirim
              perintah langsung dari HP tanpa buka website.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              {connected && waState?.me ? (
                <span className="font-mono text-xs text-muted-foreground">
                  +{waState.me}
                </span>
              ) : null}
              <Button
                className="ml-auto"
                disabled={busy}
                onClick={refreshAll}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <RefreshCwIcon className="size-3.5" />
                <span className="sr-only">Segarkan</span>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── QR / Connected card ── */}
      <section className="space-y-4 rounded-xl border border-border/40 bg-card/30 p-4">
        <h2 className="text-sm font-semibold">Sambungan Perangkat</h2>
        {connected ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <CheckCircle2Icon className="size-10 text-emerald-500" />
            <p className="text-sm font-medium">WhatsApp aktif & terhubung</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Bot siap menerima pesan. Daftarkan nomor owner dengan kode
              verifikasi di bawah supaya bot mau merespons.
            </p>
            <Button
              disabled={busy}
              onClick={logout}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOutIcon className="size-3.5" />
              Putuskan WhatsApp
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex size-[300px] max-w-full items-center justify-center rounded-xl border border-dashed border-border/60 bg-background/60">
              {showQr ? (
                <Image
                  alt="QR code WhatsApp"
                  className="rounded-lg"
                  height={280}
                  src={waState.qr as string}
                  unoptimized
                  width={280}
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  {isActivating ? (
                    <Loader2Icon className="size-8 animate-spin" />
                  ) : (
                    <QrCodeIcon className="size-10" />
                  )}
                  <p className="px-6 text-center text-xs">
                    {isActivating
                      ? "Menyiapkan QR code…"
                      : "Klik Sambungkan untuk memunculkan QR."}
                  </p>
                </div>
              )}
            </div>

            <ol className="w-full max-w-sm space-y-1 text-xs text-muted-foreground">
              <li>1. Buka WhatsApp di HP → Perangkat tertaut.</li>
              <li>2. Ketuk Tautkan perangkat.</li>
              <li>3. Arahkan kamera ke QR di atas.</li>
            </ol>

            <Button
              disabled={isActivating}
              onClick={connect}
              size="sm"
              type="button"
            >
              {isActivating ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <QrCodeIcon className="size-3.5" />
              )}
              {showQr ? "QR aktif — scan dari HP" : "Sambungkan"}
            </Button>
          </div>
        )}

        {waState?.error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {waState.error}
          </p>
        ) : null}
      </section>

      {/* ── Verification code ── */}
      <VerifCodeCard
        active={activeCode}
        busy={busy}
        onGenerate={generateCode}
      />

      {/* ── Verified owners ── */}
      <OwnersCard
        busy={busy}
        onRevoke={revokeOwner}
        owners={owners}
      />

      {/* ── Audit log ── */}
      <AuditLogCard logs={logs} />

      <p className="text-[11px] text-muted-foreground">
        Kredensial WhatsApp disimpan terenkripsi di database. Di Vercel,
        koneksi WebSocket tidak menetap antar cold start — untuk online 24 jam
        jalankan di host yang selalu nyala atau gunakan bridge eksternal.
      </p>
    </div>
  );
}
