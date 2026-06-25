"use client";

import { motion } from "framer-motion";
import {
  FileIcon,
  FileTextIcon,
  Loader2Icon,
  LockKeyholeIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PinConfirmDialog } from "@/components/security/pin-confirm-dialog";
import type { VaultFileSnapshot } from "@/lib/vault/types";
import { cn, formatBytes } from "@/lib/utils";

type VaultMediaPreviewProps = {
  file: VaultFileSnapshot;
  openUrl: string;
  textContent?: string;
  textTruncated?: boolean;
  className?: string;
};

export function VaultMediaPreview({
  file,
  openUrl,
  textContent,
  textTruncated,
  className,
}: VaultMediaPreviewProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isImage = file.mimeType.startsWith("image/");
  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isPdf = file.mimeType === "application/pdf";

  const loadPreview = useCallback(async () => {
    if (textContent !== undefined) {
      setUnlocked(true);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(openUrl, { credentials: "same-origin" });
      if (res.status === 401) {
        setPinOpen(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLoadError("Gagal memuat pratinjau");
        setLoading(false);
        return;
      }
      const blob = await res.blob();
      setBlobUrl(URL.createObjectURL(blob));
      setUnlocked(true);
    } catch {
      setLoadError("Gagal memuat pratinjau");
    } finally {
      setLoading(false);
    }
  }, [openUrl, textContent]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const onPinConfirmed = useCallback(async () => {
    setPinOpen(false);
    setLoading(true);
    try {
      const res = await fetch(openUrl, { credentials: "same-origin" });
      if (!res.ok) {
        setLoadError("Gagal memuat setelah PIN");
        return;
      }
      const blob = await res.blob();
      setBlobUrl(URL.createObjectURL(blob));
      setUnlocked(true);
    } catch {
      setLoadError("Gagal memuat pratinjau");
    } finally {
      setLoading(false);
    }
  }, [openUrl]);

  const previewSrc = blobUrl ?? openUrl;

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-black/30 py-12",
          className
        )}
      >
        <Loader2Icon className="size-5 animate-spin text-emerald-400" />
        <span className="text-xs text-emerald-300/70">Memuat pratinjau…</span>
      </div>
    );
  }

  if (!unlocked && !textContent) {
    return (
      <>
        <div
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border border-dashed border-emerald-500/30 bg-emerald-950/20 px-4 py-8 text-center",
            className
          )}
        >
          <LockKeyholeIcon className="size-8 text-emerald-400/50" />
          <p className="text-xs text-emerald-200/60">
            Konfirmasi PIN untuk melihat isi file
          </p>
          <Button
            onClick={() => setPinOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Masukkan PIN
          </Button>
        </div>
        <PinConfirmDialog
          onConfirmed={onPinConfirmed}
          onOpenChange={setPinOpen}
          open={pinOpen}
        />
      </>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn("space-y-3", className)}
      initial={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.35 }}
    >
      {isImage && (
        <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-black/40 shadow-lg shadow-emerald-500/5">
          <img
            alt={file.name}
            className="max-h-80 w-full object-contain"
            src={previewSrc}
          />
        </div>
      )}

      {isVideo && (
        <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-black shadow-lg">
          <video
            className="max-h-80 w-full"
            controls
            playsInline
            src={previewSrc}
          >
            <track kind="captions" />
          </video>
        </div>
      )}

      {isAudio && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/30 p-4">
          <audio className="w-full" controls src={previewSrc}>
            <track kind="captions" />
          </audio>
        </div>
      )}

      {isPdf && blobUrl && (
        <div className="overflow-hidden rounded-xl border border-emerald-500/25 bg-muted/20">
          <iframe
            className="h-96 w-full"
            src={blobUrl}
            title={file.name}
          />
        </div>
      )}

      {textContent !== undefined && (
        <pre className="max-h-72 overflow-auto rounded-xl border border-emerald-500/20 bg-black/50 p-4 font-mono text-[11px] leading-relaxed text-emerald-100/90">
          <code className="whitespace-pre-wrap break-words">{textContent}</code>
          {textTruncated && (
            <div className="mt-2 text-[10px] text-emerald-300/50">
              — dipotong — unduh untuk konten penuh
            </div>
          )}
        </pre>
      )}

      {!isImage &&
        !isVideo &&
        !isAudio &&
        !isPdf &&
        textContent === undefined && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-emerald-500/25 bg-black/20 px-4 py-6">
            <FileIcon className="size-8 text-emerald-400/30" />
            <div>
              <p className="text-sm font-medium text-emerald-100/80">
                {file.name}
              </p>
              <p className="text-[11px] text-emerald-300/50">
                {file.type} · {formatBytes(file.size)} — unduh untuk membuka
              </p>
            </div>
          </div>
        )}

      {loadError && (
        <p className="text-xs text-destructive">{loadError}</p>
      )}

      <PinConfirmDialog
        onConfirmed={onPinConfirmed}
        onOpenChange={setPinOpen}
        open={pinOpen}
      />
    </motion.div>
  );
}

/** Compact file type badge for vault cards */
export function VaultFileMeta({ file }: { file: VaultFileSnapshot }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
        {file.type}
      </span>
      <span>{formatBytes(file.size)}</span>
      {file.summary && (
        <span className="flex items-center gap-1 text-muted-foreground/80">
          <FileTextIcon className="size-3" />
          {file.summary}
        </span>
      )}
    </div>
  );
}
