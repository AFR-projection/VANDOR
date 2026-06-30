"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2Icon,
  CopyIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderLockIcon,
  LockIcon,
  ShieldCheckIcon,
  SparklesIcon,
  StarIcon,
} from "lucide-react";
import { VaultDownloadButton } from "@/components/chat/vault-download-button";
import { VaultMediaPreview } from "@/components/chat/vault-media-preview";
import { apiBasePath } from "@/lib/app-url";
import type { ChatMessage } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";
import type {
  VaultDetailNotice,
  VaultListNotice,
  VaultOpenNotice,
  VaultUploadNotice,
} from "@/lib/vault/notice";

const typeColors: Record<string, string> = {
  image: "text-pink-400 bg-pink-500/10",
  video: "text-violet-400 bg-violet-500/10",
  audio: "text-blue-400 bg-blue-500/10",
  pdf: "text-red-400 bg-red-500/10",
  docx: "text-blue-500 bg-blue-600/10",
  xlsx: "text-green-500 bg-green-600/10",
  text: "text-slate-400 bg-slate-500/10",
  code: "text-amber-400 bg-amber-500/10",
  json: "text-yellow-400 bg-yellow-500/10",
  other: "text-gray-400 bg-gray-500/10",
};

function typeIcon(type: string) {
  if (type === "image") return FileImageIcon;
  if (type === "video") return FileVideoIcon;
  if (type === "audio") return FileAudioIcon;
  if (type === "pdf" || type === "docx" || type === "text") return FileTextIcon;
  return FileIcon;
}

function copyText(text: string) {
  void navigator.clipboard.writeText(text);
}

export function getVaultListFromMessage(
  message: ChatMessage
): VaultListNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-list" && "data" in part) {
      return part.data as VaultListNotice;
    }
  }
  return null;
}

export function getVaultOpenFromMessage(
  message: ChatMessage
): VaultOpenNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-open" && "data" in part) {
      return part.data as VaultOpenNotice;
    }
  }
  return null;
}

export function getVaultDetailFromMessage(
  message: ChatMessage
): VaultDetailNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-detail" && "data" in part) {
      return part.data as VaultDetailNotice;
    }
  }
  return null;
}

export function getVaultUploadFromMessage(
  message: ChatMessage
): VaultUploadNotice | null {
  for (const part of message.parts) {
    if (part.type === "data-vault-upload" && "data" in part) {
      return part.data as VaultUploadNotice;
    }
  }
  return null;
}

// ── Vault List Card ───────────────────────────────────────────────

export function VaultListCard({ data }: { data: VaultListNotice }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/35 bg-card/95 shadow-xl shadow-emerald-500/8 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/5"
          style={{
            animation: "vandor-download-aurora 4s ease-in-out infinite",
          }}
        />
        <div className="relative flex items-center gap-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-xl bg-black/20 ring-1 ring-white/20">
            <FolderLockIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {data.filterLabel
                ? `Berangkas · ${data.filterLabel}`
                : "Berangkas Pribadi"}
            </p>
            <p className="text-[11px] text-white/70">
              Terenkripsi AES-256-GCM
              {data.totalBytes !== undefined && data.totalBytes > 0 && (
                <span> · {formatBytes(data.totalBytes)} ditampilkan</span>
              )}
            </p>
          </div>
          {data.total > 0 && (
            <div className="rounded-xl bg-black/20 px-3 py-2 text-right ring-1 ring-white/15">
              <p className="text-xl font-bold tabular-nums leading-none">
                {data.total}
              </p>
              <p className="text-[9px] uppercase tracking-wide opacity-70">
                file
              </p>
            </div>
          )}
        </div>
      </div>

      {/* File list */}
      <div className="space-y-1.5 p-3">
        {data.files.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Berangkas kosong. Ketik{" "}
            <span className="font-mono text-foreground/70">add</span> di Vault
            Mode.
          </p>
        ) : (
          data.files.map((file, index) => {
            const Icon = typeIcon(file.type);
            const colorClass =
              typeColors[file.type] ?? "text-gray-400 bg-gray-500/10";
            return (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="group flex items-center gap-3 rounded-xl border border-border/30 bg-muted/15 px-3 py-2.5 transition-colors hover:bg-muted/30"
                initial={{ opacity: 0, x: -6 }}
                key={file.id}
                transition={{ delay: index * 0.04 }}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    colorClass
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {file.pinned && (
                      <StarIcon
                        aria-label="Favorit"
                        className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
                      />
                    )}
                    <span className="truncate">{file.name}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-mono text-[10px] opacity-70">
                      {file.id.slice(0, 8)}…
                    </span>
                    {" · "}
                    {file.type} · {formatBytes(file.size)}
                    {file.folder && (
                      <span className="opacity-70"> · 📁 {file.folder}</span>
                    )}
                    {file.tags.length > 0 && (
                      <span className="opacity-60">
                        {" "}
                        · {file.tags.slice(0, 2).join(", ")}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => copyText(file.id)}
                    title="Salin ID file"
                    type="button"
                  >
                    <span className="sr-only">Salin ID</span>
                    <CopyIcon className="size-3.5" />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => copyText(`/share-to-ai ${file.id}`)}
                    title="Salin /share-to-ai"
                    type="button"
                  >
                    <span className="sr-only">Salin share-to-ai</span>
                    <SparklesIcon className="size-3.5" />
                  </button>
                  <VaultDownloadButton
                    filename={file.name}
                    iconOnly
                    url={
                      file.id
                        ? `${apiBasePath()}/api/vault/${file.id}/download`
                        : "#"
                    }
                  />
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-border/25 bg-muted/10 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <LockIcon className="size-3 shrink-0 text-emerald-500/70" />
          Vault: <span className="font-mono text-foreground/50">/v</span>
          {" · "}
          Bagikan:{" "}
          <span className="font-mono text-foreground/50">
            /share-to-ai &lt;id&gt;
          </span>
        </p>
      </div>
    </motion.div>
  );
}

// ── Vault Open Card ───────────────────────────────────────────────

export function VaultOpenCard({ data }: { data: VaultOpenNotice }) {
  const { file, openUrl, downloadUrl } = data;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/35 bg-card/95 shadow-xl shadow-teal-500/8 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/5"
          style={{
            animation: "vandor-download-aurora 4s ease-in-out infinite",
          }}
        />
        <div className="relative flex items-center gap-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-xl bg-black/20 ring-1 ring-white/20">
            <FolderLockIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">File Berangkas Dibuka</p>
            <p className="text-[11px] text-white/70">
              Didekripsi untuk sesi chat ini
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <VaultMediaPreview file={file} openUrl={openUrl} />

        <div className="rounded-xl border border-border/30 bg-muted/15 px-3 py-2.5">
          <p className="truncate text-sm font-medium">{file.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {file.type} · {formatBytes(file.size)}
            {file.summary ? ` · ${file.summary}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <VaultDownloadButton
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg"
            filename={file.name}
            label="Unduh"
            url={downloadUrl}
            variant="default"
          />
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-border/40 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/30"
            onClick={() => copyText(`/share-to-ai ${file.id}`)}
            type="button"
          >
            <CopyIcon className="size-4" />
            Salin /share-to-ai
          </button>
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
          <SparklesIcon className="size-3 text-primary" />
          Minta analisis di pesan berikutnya.
        </p>
      </div>
    </motion.div>
  );
}

// ── Vault Upload Success Card ─────────────────────────────────────

export function VaultUploadSuccessCard({ data }: { data: VaultUploadNotice }) {
  const { file } = data;
  const Icon = typeIcon(file.type);
  const downloadUrl = `${apiBasePath()}/api/vault/${file.id}/download`;
  const colorClass = typeColors[file.type] ?? "text-gray-400 bg-gray-500/10";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/20 bg-card/95 shadow-xl shadow-emerald-500/10 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 px-4 py-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/5"
          style={{
            animation: "vandor-download-aurora 4s ease-in-out infinite",
          }}
        />
        <div className="relative flex items-center gap-3 text-white">
          <div className="flex size-10 items-center justify-center rounded-xl bg-black/20 ring-1 ring-white/20">
            <CheckCircle2Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Upload Berhasil</p>
            <p className="text-[11px] text-white/70">
              Terenkripsi AES-256-GCM · disimpan aman
            </p>
          </div>
          <ShieldCheckIcon className="size-5 shrink-0 opacity-80" />
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* File info */}
        <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-muted/15 px-3 py-3">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl",
              colorClass
            )}
          >
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {file.type} · {formatBytes(file.size)}
            </p>
            {file.summary && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/70">
                {file.summary}
              </p>
            )}
            {file.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {file.tags.map((tag) => (
                  <span
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]"
                    key={tag}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
            onClick={() => copyText(`/share-to-ai ${file.id}`)}
            type="button"
          >
            <CopyIcon className="size-4" />
            Salin /share-to-ai
          </button>
          <VaultDownloadButton
            filename={file.name}
            label="Unduh"
            url={downloadUrl}
            variant="outline"
          />
        </div>

        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
          <LockIcon className="size-3 shrink-0 text-emerald-500/60" />
          Lihat: <span className="font-mono text-foreground/40">/v</span>
          {" → "}
          <span className="font-mono text-foreground/40">list</span>
          {" · Bagikan: "}
          <span className="font-mono text-foreground/40">
            /share-to-ai &lt;id&gt;
          </span>
        </p>
      </div>
    </motion.div>
  );
}

// ── Vault Detail Card ─────────────────────────────────────────────

export function VaultDetailCard({ data }: { data: VaultDetailNotice }) {
  const Icon = typeIcon(data.file.type);
  const colorClass =
    typeColors[data.file.type] ?? "text-gray-400 bg-gray-500/10";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-sm overflow-hidden rounded-2xl border border-border/35 bg-card/95 shadow-lg"
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-xl",
            colorClass
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{data.file.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {data.file.type} · {formatBytes(data.file.size)}
          </p>
          {data.file.summary && (
            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/70">
              {data.file.summary}
            </p>
          )}
          {data.file.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {data.file.tags.map((tag) => (
                <span
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
