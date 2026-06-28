"use client";

import {
  FingerprintIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { GateNumpad } from "@/components/gate/gate-numpad";
import { GatePinDisplay } from "@/components/gate/gate-pin-display";
import { GateScene } from "@/components/gate/gate-scene";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "motion/react";

const PIN_LENGTH = 4;

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
  const reduceMotion = useReducedMotion();

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
  const attemptsLeft = status?.attemptsLeft ?? 3;

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
          redirect: "manual",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin: value, redirectUrl: target }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          redirectUrl?: string;
          error?: string;
        };

        if (res.ok && data.ok) {
          setSuccess(true);
          window.location.assign(
            `${base}${data.redirectUrl?.startsWith("/") ? data.redirectUrl : target}`
          );
          return;
        }

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
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="relative z-10 w-full max-w-[22rem]"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border border-border/50 bg-card/40 p-6 backdrop-blur-xl sm:p-8",
          success && "ring-2 ring-primary/40"
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent"
        />

        <div className="mb-8 flex flex-col items-center text-center">
          <motion.div
            animate={
              locked
                ? { rotate: [0, -8, 8, 0] }
                : success
                  ? { scale: [1, 1.08, 1] }
                  : {}
            }
            className={cn(
              "mb-5 flex size-16 items-center justify-center rounded-2xl border backdrop-blur-sm",
              locked
                ? "border-destructive/40 bg-destructive/10"
                : success
                  ? "border-primary/50 bg-primary/15"
                  : "border-border/60 bg-background/50"
            )}
            transition={{ duration: 0.4 }}
          >
            {locked ? (
              <LockKeyholeIcon className="size-7 text-destructive" />
            ) : success ? (
              <ShieldCheckIcon className="size-7 text-primary" />
            ) : (
              <FingerprintIcon className="size-7 text-primary" />
            )}
          </motion.div>
          <p className="font-display text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Secure Access
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            VANDOR
          </h1>
          <p className="mt-2 max-w-[16rem] text-[13px] leading-relaxed text-muted-foreground">
            {locked
              ? "Terlalu banyak percobaan gagal. Tunggu hitung mundur di bawah."
              : loading
                ? "Memverifikasi…"
                : success
                  ? "Akses diberikan — membuka…"
                  : "Masukkan PIN 4 digit untuk melanjutkan"}
          </p>
        </div>

        {sessionExpired && !locked ? (
          <div className="mb-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-center text-[12px] leading-relaxed text-primary">
            Sesi berakhir — masukkan PIN lagi untuk melanjutkan.
          </div>
        ) : null}

        {wasRevoked && !locked && !sessionExpired ? (
          <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-center text-[12px] leading-relaxed text-amber-800 dark:text-amber-200">
            Login di perangkat lain terdeteksi. Masukkan PIN untuk lanjut di
            sini.
          </div>
        ) : null}

        {locked ? (
          <div className="mb-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-[10px] uppercase tracking-wider text-destructive/80">
              Perangkat terkunci
            </p>
            <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-destructive">
              {formatRemaining(remainingMs)}
            </p>
          </div>
        ) : (
          <GatePinDisplay
            filled={pin.length}
            locked={locked}
            shake={shake}
            success={success}
          />
        )}

        {error && !locked ? (
          <p className="mb-4 text-center text-[12px] text-destructive">
            {error}
          </p>
        ) : null}

        {!locked ? (
          <p className="mb-5 text-center text-[11px] text-muted-foreground">
            Sisa percobaan{" "}
            <span className="font-semibold text-foreground">{attemptsLeft}</span>
            <span className="text-muted-foreground/60">
              {" "}
              / {status?.maxAttempts ?? 3}
            </span>
          </p>
        ) : null}

        {!locked ? (
          <GateNumpad disabled={locked || loading || success} onKey={onKey} />
        ) : null}

        {loading && !success ? (
          <div className="mt-4 flex justify-center">
            <motion.span
              animate={{ opacity: [0.4, 1, 0.4] }}
              className="size-1.5 rounded-full bg-primary"
              transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY }}
            />
          </div>
        ) : null}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/75">
        <SparklesIcon className="size-3.5 text-primary/70" />
        PIN · satu perangkat · sesi 30 hari
      </p>
    </motion.div>
  );
}

export default function GatePage() {
  return (
    <div className="vandor-gate relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <GateScene />
      <Suspense
        fallback={
          <div className="relative z-10 text-muted-foreground text-sm">
            Memuat…
          </div>
        }
      >
        <GateForm />
      </Suspense>
    </div>
  );
}
