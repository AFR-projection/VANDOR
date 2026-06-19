"use client";

import { motion } from "framer-motion";
import {
  AlertTriangleIcon,
  BrainIcon,
  GlobeIcon,
  LockKeyholeIcon,
  ShieldCheckIcon,
  TerminalIcon,
  WifiOffIcon,
  XIcon,
} from "lucide-react";
import { useEffect } from "react";

export type VaultModeBannerProps = {
  enteredAt?: string;
  onExit: () => void;
};

export function VaultModeBanner({
  enteredAt,
  onExit,
}: VaultModeBannerProps) {
  // Bind ESC to exit Vault Mode for ergonomic exit
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        (e.ctrlKey || e.metaKey) // Ctrl/Cmd+Esc to avoid accidental exit
      ) {
        onExit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onExit]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-20 border-b border-emerald-500/30 bg-gradient-to-r from-emerald-950/95 via-teal-950/95 to-emerald-950/95 backdrop-blur-xl"
      data-testid="vault-mode-banner"
      initial={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Animated scan-line for terminal feel */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <motion.div
          animate={{ y: ["-100%", "1000%"] }}
          className="h-px w-full bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent"
          transition={{
            duration: 6,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        />
      </div>

      <div className="relative mx-auto flex max-w-4xl flex-wrap items-center gap-3 px-4 py-2.5 font-mono">
        <div className="flex items-center gap-2">
          <div className="relative flex size-2.5 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </div>
          <LockKeyholeIcon className="size-4 text-emerald-400" />
          <span
            className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300"
            data-testid="vault-mode-label"
          >
            VAULT MODE
          </span>
        </div>

        <div className="hidden h-4 w-px bg-emerald-500/30 sm:block" />

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-wider">
          <span className="flex items-center gap-1 text-emerald-200/80">
            <BrainIcon className="size-3 text-red-400" />
            <span className="text-emerald-200/60">AI:</span>
            <span className="font-bold text-red-400">OFF</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-200/80">
            <ShieldCheckIcon className="size-3 text-red-400" />
            <span className="text-emerald-200/60">MEMORY:</span>
            <span className="font-bold text-red-400">OFF</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-200/80">
            <GlobeIcon className="size-3 text-red-400" />
            <span className="text-emerald-200/60">WEB:</span>
            <span className="font-bold text-red-400">OFF</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-200/80">
            <WifiOffIcon className="size-3 text-red-400" />
            <span className="text-emerald-200/60">OPENROUTER:</span>
            <span className="font-bold text-red-400">OFF</span>
          </span>
          <span className="flex items-center gap-1 text-emerald-200/80">
            <TerminalIcon className="size-3 text-emerald-400" />
            <span className="text-emerald-200/60">TOOLS:</span>
            <span className="font-bold text-emerald-300">VAULT ONLY</span>
          </span>
        </div>

        <button
          className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/20 active:scale-95"
          data-testid="vault-mode-exit-btn"
          onClick={onExit}
          type="button"
        >
          <XIcon className="size-3" />
          Exit
        </button>
      </div>

      {enteredAt && (
        <div className="relative mx-auto max-w-4xl px-4 pb-1.5 font-mono text-[10px] text-emerald-300/60">
          <span className="opacity-70">
            $ vault@vandor:~ entered at{" "}
            {new Date(enteredAt).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
        </div>
      )}
    </motion.div>
  );
}

/** Hint shown below empty input area while in Vault Mode. */
export function VaultModeHint() {
  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="mx-auto max-w-2xl rounded-xl border border-emerald-500/20 bg-emerald-950/30 px-4 py-3 font-mono text-[11px] text-emerald-200/70"
      data-testid="vault-mode-hint"
      initial={{ opacity: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <AlertTriangleIcon className="size-3.5 text-emerald-400" />
        <span className="font-bold uppercase tracking-wider text-emerald-300">
          Vault Mode — Commands
        </span>
      </div>
      <div className="space-y-0.5 leading-relaxed text-emerald-200/80">
        <div>
          <span className="text-emerald-400">$</span> <b>list</b>{" "}
          <span className="text-emerald-200/40">— daftar file</span>
        </div>
        <div>
          <span className="text-emerald-400">$</span> <b>read</b>{" "}
          <span className="text-emerald-200/40">&lt;id|nama&gt; — baca file</span>
        </div>
        <div>
          <span className="text-emerald-400">$</span> <b>add</b>{" "}
          <span className="text-emerald-200/40">— upload file baru</span>
        </div>
        <div>
          <span className="text-emerald-400">$</span> <b>update</b>{" "}
          <span className="text-emerald-200/40">
            &lt;id&gt; tags:work,private — edit metadata
          </span>
        </div>
        <div>
          <span className="text-emerald-400">$</span> <b>delete</b>{" "}
          <span className="text-emerald-200/40">&lt;id|nama&gt; — hapus</span>
        </div>
        <div>
          <span className="text-emerald-400">$</span> <b>exit</b>{" "}
          <span className="text-emerald-200/40">— kembali ke Chat Mode</span>
        </div>
      </div>
    </motion.div>
  );
}
