"use client";

import { LockKeyholeIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";

const PIN_LENGTH = 4;
const KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "clear",
  "0",
  "back",
];

type GateStatus = {
  configured: boolean;
  pinLength: number;
  maxAttempts: number;
  locked: boolean;
  lockedUntil: number | null;
  attemptsLeft: number;
};

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function GateForm() {
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirectUrl") ?? "/";
  const reason = searchParams.get("reason");
  const wasRevoked =
    searchParams.get("revoked") === "1" || reason === "revoked";
  const sessionExpired = reason === "expired";

  const submitInFlight = useRef(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const statusKey =
    loading || success
      ? null
      : `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/gate/status`;

  const { data: status, mutate: refetchStatus } = useSWR<GateStatus>(
    statusKey,
    (url: string) =>
      fetch(url, { credentials: "same-origin" }).then((r) => r.json()),
    { refreshInterval: 2000, revalidateOnFocus: true }
  );

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const locked = Boolean(
    status?.locked && status.lockedUntil && status.lockedUntil > now
  );
  const remainingMs = locked ? (status?.lockedUntil ?? 0) - now : 0;
  const attemptsLeft = status?.attemptsLeft ?? PIN_LENGTH;

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== PIN_LENGTH || submitInFlight.current || success) {
        return;
      }
      submitInFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        const target = redirectUrl.startsWith("/") ? redirectUrl : "/";
        const res = await fetch(`${base}/api/gate/verify`, {
          method: "POST",
          credentials: "same-origin",
          redirect: "follow",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value, redirectUrl: target }),
        });

        if (res.redirected && res.url) {
          setSuccess(true);
          window.location.assign(res.url);
          return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Akses ditolak");
          setShake(true);
          setPin("");
          submitInFlight.current = false;
          await refetchStatus();
          setTimeout(() => setShake(false), 500);
          return;
        }

        setSuccess(true);
        window.location.assign(`${base}${target}`);
      } catch {
        setError("Koneksi gagal");
        setShake(true);
        submitInFlight.current = false;
        setTimeout(() => setShake(false), 500);
      } finally {
        if (!success) {
          setLoading(false);
        }
      }
    },
    [redirectUrl, refetchStatus, success]
  );

  useEffect(() => {
    if (
      pin.length === PIN_LENGTH &&
      !locked &&
      !loading &&
      !success &&
      !submitInFlight.current
    ) {
      void submit(pin);
    }
  }, [pin, submit, locked, loading, success]);

  const onKey = (key: string) => {
    if (locked || loading || success) {
      return;
    }
    setError(null);
    if (key === "clear") {
      setPin("");
      return;
    }
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length < PIN_LENGTH) {
      setPin((p) => p + key);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (locked || loading) {
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        onKey(e.key);
      } else if (e.key === "Backspace") {
        onKey("back");
      } else if (e.key === "Escape") {
        onKey("clear");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, loading, pin]);

  return (
    <div className="relative z-10 w-full max-w-xs">
      <div className="mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card ring-1 ring-foreground/5">
          {locked ? (
            <LockKeyholeIcon className="size-6 text-destructive" />
          ) : (
            <SparklesIcon className="size-6 text-foreground/80" />
          )}
        </div>
        <h1 className="font-semibold text-2xl tracking-tight">VANDOR</h1>
        <p className="mt-2 max-w-xs text-[13px] text-muted-foreground leading-relaxed">
          {locked
            ? "Akses diblokir karena 3x percobaan gagal."
            : "Masukkan PIN 4 digit untuk login"}
        </p>
      </div>

      {sessionExpired && !locked && (
        <div className="mb-5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-center text-[12px] leading-relaxed text-primary">
          Sesi tidak valid atau cookie login belum terpasang. Masukkan PIN lagi
          untuk melanjutkan.
        </div>
      )}

      {wasRevoked && !locked && !sessionExpired && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-center text-[12px] leading-relaxed text-amber-700 dark:text-amber-300">
          Akun ini hanya aktif di satu perangkat. Anda login di perangkat lain
          atau sesi diakhiri — perangkat ini keluar otomatis. Masukkan PIN untuk
          lanjut di sini.
        </div>
      )}

      {locked ? (
        <div className="mb-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-center">
          <p className="text-[11px] uppercase tracking-wider text-destructive/80">
            Perangkat diblokir
          </p>
          <p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-destructive">
            {formatRemaining(remainingMs)}
          </p>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Coba lagi setelah waktu di atas habis.
          </p>
        </div>
      ) : (
        <div
          className={`mb-6 flex justify-center gap-4 ${shake ? "animate-[vandor-shake_0.45s_ease]" : ""}`}
        >
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              className={`size-3.5 rounded-full border transition-all duration-200 ${
                i < pin.length
                  ? "scale-110 border-foreground bg-foreground"
                  : "border-border/80 bg-transparent"
              }`}
              key={i}
            />
          ))}
        </div>
      )}

      {error && !locked && (
        <p className="mb-3 text-center text-[12px] text-destructive">{error}</p>
      )}

      {!locked && (
        <p className="mb-4 text-center text-[11px] text-muted-foreground/80">
          Sisa percobaan:{" "}
          <span className="font-medium text-foreground">{attemptsLeft}</span> /{" "}
          {status?.maxAttempts ?? 3}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((key) => (
          <Button
            className="h-14 rounded-xl border border-border/40 bg-card/60 text-lg font-medium tabular-nums transition-all hover:bg-accent active:scale-[0.96] disabled:opacity-40"
            disabled={locked || loading || success}
            key={key}
            onClick={() => onKey(key)}
            type="button"
            variant="ghost"
          >
            {key === "clear" ? "C" : key === "back" ? "←" : key}
          </Button>
        ))}
      </div>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/70">
        <ShieldCheckIcon className="size-3" />
        Login PIN · satu perangkat aktif · sesi 30 hari
      </p>
    </div>
  );
}

export default function GatePage() {
  return (
    <div className="vandor-gate relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 0%, oklch(0.55 0.12 220 / 0.15), transparent 55%)",
        }}
      />
      <Suspense
        fallback={<div className="text-muted-foreground text-sm">…</div>}
      >
        <GateForm />
      </Suspense>
    </div>
  );
}
