"use client";

import { motion } from "framer-motion";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DownloadIcon,
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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

// ── Vault Mode lifecycle cards ─────────────────────────────────────

export function VaultModeEnterCard({ data: _data }: { data: VaultModeNotice }) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-950/40 font-mono shadow-lg shadow-emerald-500/10"
      data-testid="vault-mode-enter-card"
      initial={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
        <LockKeyholeIcon className="size-4 text-emerald-400" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">
          Vault Mode Active
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-bold text-emerald-300">LIVE</span>
        </div>
      </div>
      <div className="space-y-1 px-4 py-3 text-[12px] leading-relaxed text-emerald-200/90">
        <div className="text-emerald-400">$ vandor --vault-mode --enter</div>
        <div className="space-y-0.5 pl-1 text-emerald-200/70">
          <div>
            <span className="text-red-400">✗</span> OpenRouter / LLM disabled
          </div>
          <div>
            <span className="text-red-400">✗</span> Memory retrieval disabled
          </div>
          <div>
            <span className="text-red-400">✗</span> pgvector / embedding disabled
          </div>
          <div>
            <span className="text-red-400">✗</span> Web search disabled
          </div>
          <div>
            <span className="text-red-400">✗</span> Context injection disabled
          </div>
          <div>
            <span className="text-emerald-400">✓</span> Vault tool only
          </div>
        </div>
        <div className="mt-2 border-t border-emerald-500/20 pt-2 text-[11px] text-emerald-300/80">
          Ketik <b className="text-emerald-300">list</b>,{" "}
          <b className="text-emerald-300">read &lt;id&gt;</b>,{" "}
          <b className="text-emerald-300">add</b>,{" "}
          <b className="text-emerald-300">update</b>,{" "}
          <b className="text-emerald-300">delete</b>, atau{" "}
          <b className="text-emerald-300">exit</b>.
        </div>
      </div>
    </motion.div>
  );
}

export function VaultModeExitCard({ data }: { data: VaultModeExitNotice }) {
  const isShareExit = data.reason === "share-to-ai";
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md overflow-hidden rounded-xl border border-border/40 bg-card/95 font-mono shadow-md"
      data-testid="vault-mode-exit-card"
      initial={{ opacity: 0, scale: 0.97 }}
    >
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/40 px-3 py-2">
        <LockOpenIcon className="size-4 text-foreground" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]">
          Chat Mode Restored
        </span>
        <div className="ml-auto flex items-center gap-1">
          <CheckCircle2Icon className="size-3.5 text-emerald-500" />
        </div>
      </div>
      <div className="px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
        <div className="text-foreground">$ vandor --vault-mode --exit</div>
        <div className="mt-1 text-muted-foreground/80">
          {isShareExit
            ? "Mode keluar otomatis karena file dibagikan ke AI."
            : "AI, memory, web search aktif kembali."}
        </div>
      </div>
    </motion.div>
  );
}

export function VaultDeniedCard({ data }: { data: VaultDeniedNotice }) {
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md overflow-hidden rounded-xl border border-red-500/30 bg-red-950/30 font-mono shadow-lg shadow-red-500/10"
      data-testid="vault-denied-card"
      initial={{ opacity: 0, scale: 0.97 }}
    >
      <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-3 py-2">
        <XCircleIcon className="size-4 text-red-400" />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
          Command Rejected
        </span>
      </div>
      <div className="space-y-2 px-4 py-3 text-[12px] leading-relaxed">
        <div className="break-all text-red-200/90">
          <span className="text-red-400">$ </span>
          <span className="opacity-90">{data.attempted}</span>
        </div>
        <div className="text-red-100/70">{data.reason}</div>
      </div>
    </motion.div>
  );
}

export function VaultReadCard({ data }: { data: VaultReadNotice }) {
  const { file, downloadUrl, textContent, textTruncated } = data;
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-950/30 font-mono shadow-lg shadow-emerald-500/10"
      data-testid="vault-read-card"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center gap-2 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
        <TerminalIcon className="size-4 text-emerald-400" />
        <span className="truncate text-[11px] font-bold uppercase tracking-wider text-emerald-300">
          read {file.name}
        </span>
      </div>
      <div className="space-y-2 px-4 py-3 text-[12px] text-emerald-200/90">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-emerald-200/70">
          <div>
            <span className="text-emerald-400/60">id:</span> {file.id}
          </div>
          <div>
            <span className="text-emerald-400/60">type:</span> {file.type}
          </div>
          <div>
            <span className="text-emerald-400/60">size:</span>{" "}
            {formatBytes(file.size)}
          </div>
          <div>
            <span className="text-emerald-400/60">mime:</span> {file.mimeType}
          </div>
        </div>
        {file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {file.tags.map((tag) => (
              <span
                className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-300"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {textContent !== undefined ? (
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-emerald-500/20 bg-black/40 p-3 text-[11px] text-emerald-100/90">
            <code className="whitespace-pre-wrap break-words">{textContent}</code>
            {textTruncated && (
              <div className="mt-2 text-[10px] text-emerald-300/60">
                — truncated (file lebih besar) — unduh untuk konten penuh.
              </div>
            )}
          </pre>
        ) : (
          <div className="mt-2 rounded-lg border border-dashed border-emerald-500/30 bg-black/20 px-3 py-4 text-[11px] text-emerald-200/60">
            Pratinjau tidak tersedia untuk tipe file ini. Unduh untuk membuka
            secara lokal.
          </div>
        )}
        <a
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300 transition-all hover:border-emerald-400/60 hover:bg-emerald-500/20"
          href={downloadUrl}
          rel="noopener"
        >
          <DownloadIcon className="size-3" />
          Download
        </a>
      </div>
    </motion.div>
  );
}

// ── Share-to-AI warning card ───────────────────────────────────────

export function ShareToAiCard({ data }: { data: ShareToAiNotice }) {
  const { file, downloadUrl } = data;
  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/40 bg-amber-950/30 shadow-2xl shadow-amber-500/20"
      data-testid="share-to-ai-card"
      initial={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative overflow-hidden border-b border-amber-500/30 bg-gradient-to-r from-amber-600/40 via-orange-600/40 to-red-600/40 px-4 py-3">
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-black/40 ring-1 ring-amber-300/30">
            <ShieldAlertIcon className="size-5 text-amber-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-amber-100">
              File dibagikan ke AI
            </p>
            <p className="text-[11px] text-amber-200/80">
              Anda secara sadar mengizinkan AI membaca file ini
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1.5 rounded-xl border border-amber-500/30 bg-amber-950/40 p-3 text-[12px] text-amber-100/90">
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            <span>
              <b>File akan dikirim ke AI.</b> Isi file akan masuk ke context
              percakapan.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            <span>
              <b>AI dapat membaca dan menganalisis</b> isi file ini di sesi chat
              berjalan.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
            <span>
              File ini <b>hanya aktif untuk sesi chat ini</b> — restart chat
              untuk mencabut akses.
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-card/60 px-3 py-2.5">
          <p className="truncate text-sm font-medium text-foreground">
            {file.name}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {file.type} · {formatBytes(file.size)} · {file.mimeType}
          </p>
          {file.summary && (
            <p className="mt-1.5 line-clamp-2 text-[11px] text-muted-foreground">
              {file.summary}
            </p>
          )}
        </div>

        <a
          className="inline-flex items-center gap-1.5 rounded-md border border-border/50 px-3 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/40"
          href={downloadUrl}
          rel="noopener"
        >
          <DownloadIcon className="size-3" />
          Unduh juga
        </a>
      </div>
    </motion.div>
  );
}
