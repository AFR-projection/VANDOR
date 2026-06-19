"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2Icon,
  CopyIcon,
  DownloadIcon,
  FileAudioIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FileVideoIcon,
  FolderLockIcon,
  LockIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";
import type {
  VaultDetailNotice,
  VaultListNotice,
  VaultOpenNotice,
  VaultUploadNotice,
} from "@/lib/vault/notice";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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

function VaultHeader({
  title,
  subtitle,
  count,
}: {
  title: string;
  subtitle: string;
  count?: number;
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-4 py-3.5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/5"
        style={{ animation: "vandor-download-aurora 4s ease-in-out infinite" }}
      />
      <div className="relative flex items-center gap-3 text-white">
        <div className="flex size-11 items-center justify-center rounded-xl bg-black/25 ring-1 ring-white/25 backdrop-blur-sm">
          <FolderLockIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight">{title}</p>
          <p className="text-xs text-white/85">{subtitle}</p>
        </div>
        {count != null && (
          <div className="rounded-xl bg-black/25 px-3 py-1.5 text-right ring-1 ring-white/20">
            <p className="text-lg font-bold tabular-nums leading-none">{count}</p>
            <p className="text-[9px] uppercase tracking-wider opacity-80">file</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function VaultListCard({ data }: { data: VaultListNotice }) {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/40 bg-card/95 shadow-2xl shadow-emerald-500/10 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <VaultHeader
        count={data.total}
        subtitle="Terenkripsi AES-256-GCM · metadata saja"
        title="Berangkas pribadi"
      />
      <div className="space-y-2 p-3">
        {data.files.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Berangkas kosong. Upload dengan <span className="font-mono">/v up</span>.
          </p>
        ) : (
          data.files.map((file, index) => {
            const Icon = typeIcon(file.type);
            return (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                className="group flex items-center gap-3 rounded-xl border border-border/35 bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40"
                initial={{ opacity: 0, x: -8 }}
                key={file.id}
                transition={{ delay: index * 0.05 }}
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-cyan-500/15 ring-1 ring-emerald-500/20">
                  <Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {file.type} · {formatBytes(file.size)}
                    {file.tags.length > 0 && (
                      <span> · {file.tags.slice(0, 2).join(", ")}</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                  <button
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    onClick={() => copyText(`/share-to-ai ${file.id}`)}
                    title="Salin /share-to-ai"
                    type="button"
                  >
                    <CopyIcon className="size-3.5" />
                  </button>
                  <a
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    href={
                      file.id
                        ? `${base()}/api/vault/${file.id}/download`
                        : "#"
                    }
                    rel="noopener"
                    title="Unduh"
                  >
                    <DownloadIcon className="size-3.5" />
                  </a>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
      <div className="border-t border-border/30 bg-muted/15 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <LockIcon className="size-3 shrink-0 text-emerald-600" />
          Vault Mode: <span className="font-mono">/v</span> · Bagikan ke AI:{" "}
          <span className="font-mono">/share-to-ai &lt;id&gt;</span>
        </p>
      </div>
    </motion.div>
  );
}

export function VaultOpenCard({ data }: { data: VaultOpenNotice }) {
  const { file, openUrl, downloadUrl } = data;
  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const Icon = typeIcon(file.type);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-border/40 bg-card/95 shadow-2xl shadow-teal-500/15 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <VaultHeader
        subtitle="Didekripsi untuk sesi chat ini · aman"
        title="File berangkas dibuka"
      />
      <div className="space-y-3 p-4">
        {isImage && (
          <div className="overflow-hidden rounded-xl border border-border/40 bg-muted/30">
            <img
              alt={file.name}
              className="max-h-72 w-full object-contain"
              src={openUrl}
            />
          </div>
        )}
        {isVideo && (
          <video
            className="max-h-72 w-full rounded-xl border border-border/40 bg-black"
            controls
            src={openUrl}
          >
            <track kind="captions" />
          </video>
        )}
        {isAudio && (
          <audio className="w-full" controls src={openUrl}>
            <track kind="captions" />
          </audio>
        )}
        {!isImage && !isVideo && !isAudio && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-8">
            <Icon className="size-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                Pratinjau tidak tersedia — unduh untuk membuka
              </p>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-border/35 bg-muted/20 px-3 py-2.5">
          <p className="text-sm font-medium">{file.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {file.type} · {formatBytes(file.size)}
            {file.summary ? ` · ${file.summary}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
            href={downloadUrl}
            rel="noopener"
          >
            <DownloadIcon className="size-4" />
            Unduh
          </a>
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40"
            onClick={() => copyText(`/share-to-ai ${file.id}`)}
            type="button"
          >
            <CopyIcon className="size-4" />
            Salin /share-to-ai
          </button>
        </div>

        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <SparklesIcon className="size-3 text-primary" />
          Minta analisis di pesan berikutnya — AI akan memakai file ini di sesi ini.
        </p>
      </div>
    </motion.div>
  );
}

export function VaultUploadSuccessCard({ data }: { data: VaultUploadNotice }) {
  const { file } = data;
  const Icon = typeIcon(file.type);
  const downloadUrl = `${base()}/api/vault/${file.id}/download`;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-500/25 bg-card/95 shadow-2xl shadow-emerald-500/15 backdrop-blur-xl"
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 px-4 py-3.5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/5"
          style={{ animation: "vandor-download-aurora 4s ease-in-out infinite" }}
        />
        <div className="relative flex items-center gap-3 text-white">
          <div className="flex size-11 items-center justify-center rounded-xl bg-black/25 ring-1 ring-white/25 backdrop-blur-sm">
            <CheckCircle2Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">
              Upload berangkas berhasil
            </p>
            <p className="text-xs text-white/85">
              Terenkripsi AES-256-GCM · disimpan aman di R2
            </p>
          </div>
          <ShieldCheckIcon className="size-6 shrink-0 opacity-90" />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3 rounded-xl border border-border/35 bg-muted/20 px-3 py-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
            <Icon className="size-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{file.name}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {file.type} · {formatBytes(file.size)}
            </p>
            {file.summary && (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
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
          <a
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40"
            href={downloadUrl}
            rel="noopener"
          >
            <DownloadIcon className="size-4" />
            Unduh
          </a>
        </div>

        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <LockIcon className="size-3 shrink-0 text-emerald-600" />
          Lihat semua: <span className="font-mono">/v list</span> · Bagikan ke AI:{" "}
          <span className="font-mono">/share-to-ai &lt;id&gt;</span>
        </p>
      </div>
    </motion.div>
  );
}

export function VaultDetailCard({ data }: { data: VaultDetailNotice }) {
  const Icon = typeIcon(data.file.type);
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full max-w-md overflow-hidden rounded-2xl border border-border/40 bg-card/95 shadow-xl"
      )}
      initial={{ opacity: 0, y: 8 }}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-500/10">
          <Icon className="size-5 text-emerald-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{data.file.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.file.type} · {formatBytes(data.file.size)}
          </p>
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
