"use client";

import { motion } from "framer-motion";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  LockKeyholeIcon,
  LockOpenIcon,
  ShieldAlertIcon,
  TerminalIcon,
  XCircleIcon,
} from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type {
  ShareToAiNotice,
  VaultDeniedNotice,
  VaultReadNotice,
} from "@/lib/vault/notice";
import type {
  VaultModeExitNotice,
  VaultModeNotice,
} from "@/lib/vault/mode";
import { formatBytes } from "@/lib/utils";
import { VaultDownloadButton } from "@/components/chat/vault-download-button";
import { VaultMediaPreview } from "@/components/chat/vault-media-preview";

export function getVaultModeEnterFromMessage(
  message: ChatMessage
): VaultModeNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-mode-enter" && "data" in part) {
      return part.data as VaultModeNotice;
    }
  }
  return null;
}

export function getVaultModeExitFromMessage(
  message: ChatMessage
): VaultModeExitNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-mode-exit" && "data" in part) {
      return part.data as VaultModeExitNotice;
    }
  }
  return null;
}

export function getVaultDeniedFromMessage(
  message: ChatMessage
): VaultDeniedNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-denied" && "data" in part) {
      return part.data as VaultDeniedNotice;
    }
  }
  return null;
}

export function getVaultReadFromMessage(
  message: ChatMessage
): VaultReadNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-read" && "data" in part) {
      return part.data as VaultReadNotice;
    }
  }
  return null;
}

export function getShareToAiFromMessage(
  message: ChatMessage
): ShareToAiNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-share-to-ai" && "data" in part) {
      return part.data as ShareToAiNotice;
    }
  }
  return null;
}

// ── Vault Mode Enter Card ─────────────────────────────────────────

export function VaultModeEnterCard({ data: _data }: { data: VaultModeNotice }) {
  const rows = [
    { label: "OpenRouter / LLM", on: false },
    { label: "Memory & Embeddings", on: false },
    { label: "Web Search", on: false },
    { label: "Context Injection", on: false },
    { label: "Vault Tools", on: true },
  ];

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/80 to-slate-950/80 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl"
      data-testid="vault-mode-enter-card"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="relative overflow-hidden border-b border-emerald-500/20 px-4 py-3">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent" />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <LockKeyholeIcon className="size-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">
              Vault Mode Active
            </p>
            <p className="text-[10px] text-emerald-400/50">
              vandor --vault-mode --enter
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* Status rows */}
      <div className="divide-y divide-emerald-500/10 font-mono">
        {rows.map(({ label, on }) => (
          <div
            className="flex items-center justify-between px-4 py-2 text-[11px]"
            key={label}
          >
            <span className="text-emerald-200/60">{label}</span>
            <span
              className={`font-bold ${on ? "text-emerald-400" : "text-red-400"}`}
            >
              {on ? "✓ ON" : "✗ OFF"}
            </span>
          </div>
        ))}
      </div>

      {/* Commands footer */}
      <div className="border-t border-emerald-500/15 bg-emerald-500/5 px-4 py-2.5">
        <p className="font-mono text-[10px] text-emerald-300/60">
          Perintah:{" "}
          {["list", "read", "add", "update", "delete", "exit"].map((cmd, i) => (
            <span key={cmd}>
              {i > 0 && <span className="opacity-40"> · </span>}
              <span className="text-emerald-300/90">{cmd}</span>
            </span>
          ))}
        </p>
      </div>
    </motion.div>
  );
}

// ── Vault Mode Exit Card ──────────────────────────────────────────

export function VaultModeExitCard({ data }: { data: VaultModeExitNotice }) {
  const isShareExit = data.reason === "share-to-ai";
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/35 bg-card/90 shadow-lg backdrop-blur-xl"
      data-testid="vault-mode-exit-card"
      initial={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2.5 border-b border-border/30 bg-muted/30 px-4 py-3">
        <div className="flex size-8 items-center justify-center rounded-lg bg-muted/60">
          <LockOpenIcon className="size-4 text-foreground/70" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em]">
            Chat Mode
          </p>
          <p className="text-[10px] text-muted-foreground">
            vandor --vault-mode --exit
          </p>
        </div>
        <CheckCircle2Icon className="ml-auto size-4 text-emerald-500" />
      </div>
      <div className="px-4 py-3 text-[12px] text-muted-foreground">
        {isShareExit
          ? "Mode keluar otomatis — file dibagikan ke AI."
          : "AI, memory, dan web search aktif kembali."}
      </div>
    </motion.div>
  );
}

// ── Vault Denied Card ─────────────────────────────────────────────

export function VaultDeniedCard({ data }: { data: VaultDeniedNotice }) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-red-500/25 bg-gradient-to-b from-red-950/70 to-slate-950/70 shadow-lg shadow-red-500/10 backdrop-blur-xl"
      data-testid="vault-denied-card"
      initial={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center gap-2.5 border-b border-red-500/20 bg-red-500/8 px-4 py-2.5">
        <XCircleIcon className="size-4 text-red-400" />
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-red-300">
          Command Rejected
        </span>
      </div>
      <div className="space-y-1.5 px-4 py-3 font-mono text-[12px]">
        <div className="break-all">
          <span className="text-red-400/70">$ </span>
          <span className="text-red-200/80">{data.attempted}</span>
        </div>
        <div className="text-[11px] text-red-200/50">{data.reason}</div>
      </div>
    </motion.div>
  );
}

// ── Vault Read Card ───────────────────────────────────────────────

export function VaultReadCard({ data }: { data: VaultReadNotice }) {
  const { file, openUrl, downloadUrl, textContent, textTruncated } = data;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-950/70 to-slate-950/70 shadow-xl shadow-emerald-500/8 backdrop-blur-xl"
      data-testid="vault-read-card"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center gap-2.5 border-b border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
        <TerminalIcon className="size-4 text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-emerald-100">
            {file.name}
          </p>
          <p className="text-[10px] text-emerald-300/50">
            {file.type} · {formatBytes(file.size)}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {file.tags.map((tag) => (
              <span
                className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] text-emerald-300/80 ring-1 ring-emerald-500/20"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <VaultMediaPreview
          file={file}
          openUrl={openUrl}
          textContent={textContent}
          textTruncated={textTruncated}
        />

        <VaultDownloadButton
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-300"
          filename={file.name}
          label="Unduh file"
          url={downloadUrl}
          variant="outline"
        />
      </div>
    </motion.div>
  );
}

// ── Share-to-AI Card ──────────────────────────────────────────────

export function ShareToAiCard({ data }: { data: ShareToAiNotice }) {
  const { file, downloadUrl } = data;

  const warnings = [
    "File akan dikirim ke AI — isi masuk ke context percakapan.",
    "AI dapat membaca dan menganalisis file ini di sesi ini.",
    "Hanya aktif untuk sesi chat ini — restart untuk mencabut.",
  ];

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-b from-amber-950/60 to-slate-950/70 shadow-2xl shadow-amber-500/15 backdrop-blur-xl"
      data-testid="share-to-ai-card"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="relative overflow-hidden border-b border-amber-500/25 px-4 py-3.5">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-600/25 via-orange-600/20 to-red-600/15" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-black/30 ring-1 ring-amber-300/25">
            <ShieldAlertIcon className="size-5 text-amber-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-amber-100">
              File dibagikan ke AI
            </p>
            <p className="text-[11px] text-amber-300/60">
              Anda secara sadar mengizinkan AI membaca file ini
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* File info */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <DatabaseIcon className="size-4 shrink-0 text-amber-400/70" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-amber-100">
                {file.name}
              </p>
              <p className="text-[11px] text-amber-300/50">
                {file.type} · {formatBytes(file.size)}
              </p>
            </div>
          </div>
          {file.summary && (
            <p className="mt-2 line-clamp-2 text-[11px] text-amber-200/50">
              {file.summary}
            </p>
          )}
        </div>

        {/* Warning list */}
        <div className="space-y-1.5 rounded-xl border border-amber-500/15 bg-amber-950/25 p-3">
          {warnings.map((w) => (
            <div className="flex items-start gap-2 text-[11px]" key={w}>
              <AlertTriangleIcon className="mt-0.5 size-3 shrink-0 text-amber-400" />
              <span className="text-amber-200/70">{w}</span>
            </div>
          ))}
        </div>

        <VaultDownloadButton
          filename={file.name}
          label="Unduh juga"
          url={downloadUrl}
          variant="outline"
        />
      </div>
    </motion.div>
  );
}
