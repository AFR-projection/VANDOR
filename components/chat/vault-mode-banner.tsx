"use client";

import { motion } from "framer-motion";
import {
  BrainIcon,
  DatabaseIcon,
  GlobeIcon,
  LockKeyholeIcon,
  SparklesIcon,
  XIcon,
  ZapOffIcon,
} from "lucide-react";
import { useEffect } from "react";
import { VAULT_MODE_COMMANDS } from "@/lib/vault/help";

export type VaultModeBannerProps = {
  enteredAt?: string;
  onExit: () => void;
};

const statusItems = [
  { icon: SparklesIcon, label: "AI", value: "OFF", off: true },
  { icon: BrainIcon, label: "Memory", value: "OFF", off: true },
  { icon: GlobeIcon, label: "Web", value: "OFF", off: true },
  { icon: ZapOffIcon, label: "LLM", value: "OFF", off: true },
  { icon: DatabaseIcon, label: "Vault", value: "ONLY", off: false },
];

export function VaultModeBanner({
  enteredAt,
  onExit,
}: VaultModeBannerProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (e.ctrlKey || e.metaKey)) {
        onExit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-20 overflow-hidden border-b border-emerald-500/25 bg-gradient-to-r from-emerald-950/97 via-slate-950/97 to-teal-950/97 backdrop-blur-2xl"
      data-testid="vault-mode-banner"
      initial={{ opacity: 0, y: -24 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Animated aurora line */}
      <motion.div
        animate={{ x: ["-120%", "220%"] }}
        aria-hidden
        className="pointer-events-none absolute top-0 h-full w-1/3 bg-gradient-to-r from-transparent via-emerald-400/8 to-transparent"
        transition={{
          duration: 4,
          repeat: Number.POSITIVE_INFINITY,
          ease: "linear",
        }}
      />

      <div className="relative mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-2">
        {/* Mode indicator */}
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-7 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <LockKeyholeIcon className="size-3.5 text-emerald-400" />
            <span className="absolute -right-0.5 -top-0.5 flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
          </div>
          <span
            className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300"
            data-testid="vault-mode-label"
          >
            Vault Mode
          </span>
        </div>

        <div className="hidden h-3.5 w-px bg-emerald-500/25 sm:block" />

        {/* Status pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {statusItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                  item.off
                    ? "bg-red-950/60 text-red-400 ring-red-500/20"
                    : "bg-emerald-950/60 text-emerald-400 ring-emerald-500/30"
                }`}
                key={item.label}
              >
                <Icon className="size-2.5" />
                <span className="text-[9px] opacity-70">{item.label}:</span>
                <span>{item.value}</span>
              </div>
            );
          })}
        </div>

        {/* Exit button */}
        <button
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-300 transition-all hover:border-emerald-400/50 hover:bg-emerald-500/15 active:scale-95"
          data-testid="vault-mode-exit-btn"
          onClick={onExit}
          type="button"
        >
          <XIcon className="size-3" />
          Exit
        </button>
      </div>

      {/* Timestamp */}
      {enteredAt && (
        <div className="relative mx-auto max-w-5xl px-4 pb-1.5">
          <span className="font-mono text-[9px] text-emerald-400/40">
            ▶ vault@vandor entered{" "}
            {new Date(enteredAt).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
            {" · Ctrl+Esc to exit"}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Command hint shown in vault mode input area */
export function VaultModeHint() {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-emerald-950/60 to-slate-950/60 shadow-lg shadow-emerald-500/5 backdrop-blur-xl"
      data-testid="vault-mode-hint"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.15, duration: 0.35 }}
    >
      <div className="flex items-center gap-2.5 border-b border-emerald-500/15 px-4 py-2.5">
        <LockKeyholeIcon className="size-3.5 text-emerald-400" />
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-300">
          Vault Mode — Perintah
        </span>
        <div className="ml-auto flex gap-1">
          <span className="size-2 rounded-full bg-red-500/60" />
          <span className="size-2 rounded-full bg-yellow-500/60" />
          <span className="size-2 rounded-full bg-emerald-500/60" />
        </div>
      </div>
      <div className="divide-y divide-emerald-500/10 font-mono">
        {VAULT_MODE_COMMANDS.map(({ cmd, desc }) => (
          <div
            className="flex items-center gap-3 px-4 py-2 text-[11px] transition-colors hover:bg-emerald-500/5"
            key={cmd}
          >
            <span className="text-emerald-400/70">$</span>
            <span className="min-w-[11rem] font-medium text-emerald-200/90">
              {cmd}
            </span>
            <span className="text-emerald-300/40">—</span>
            <span className="text-emerald-200/50">{desc}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
