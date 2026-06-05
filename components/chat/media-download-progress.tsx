"use client";

import { motion } from "framer-motion";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  InstagramIcon,
  Music2Icon,
  VideoIcon,
} from "lucide-react";
import { formatBytes } from "@/lib/media/progress";
import {
  MEDIA_DOWNLOAD_STEPS,
  type MediaDownloadProgressData,
  type MediaPlatform,
} from "@/lib/media/types";
import type { ChatMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { toErrorMessage } from "@/lib/utils/error-message";

export function getMediaDownloadProgressFromMessage(
  message: ChatMessage
): MediaDownloadProgressData | null {
  let latest: MediaDownloadProgressData | null = null;
  for (const part of message.parts) {
    if (part.type === "data-media-download-progress" && "data" in part) {
      latest = part.data as MediaDownloadProgressData;
    }
  }
  return latest;
}

function platformMeta(platform?: MediaPlatform) {
  switch (platform) {
    case "tiktok":
      return {
        label: "TikTok",
        icon: VideoIcon,
        accent: "from-pink-500/80 via-rose-500/70 to-cyan-400/80",
      };
    case "instagram":
      return {
        label: "Instagram",
        icon: InstagramIcon,
        accent: "from-violet-500/80 via-fuchsia-500/70 to-orange-400/80",
      };
    case "youtube":
      return {
        label: "YouTube",
        icon: VideoIcon,
        accent: "from-red-500/90 via-red-600/80 to-red-400/70",
      };
    default:
      return {
        label: "Media",
        icon: DownloadIcon,
        accent: "from-primary/80 via-primary/60 to-violet-500/70",
      };
  }
}

function stepIndex(status: MediaDownloadProgressData["status"]): number {
  switch (status) {
    case "validating":
      return 0;
    case "resolving":
      return 1;
    case "downloading":
      return 2;
    case "uploading":
      return 3;
    case "complete":
      return 4;
    default:
      return 0;
  }
}

export function MediaDownloadProgressCard({
  progress,
  isActive,
}: {
  progress: MediaDownloadProgressData;
  isActive: boolean;
}) {
  const meta = platformMeta(progress.platform);
  const Icon = meta.icon;
  const isError = progress.status === "error";
  const isComplete = progress.status === "complete";
  const activeStep = stepIndex(progress.status);
  const formatLabel = progress.format === "audio" ? "MP3" : "MP4";

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "w-full max-w-md overflow-hidden rounded-2xl border shadow-lg backdrop-blur-md",
        isError
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/50 bg-card/80 shadow-[var(--shadow-card)]"
      )}
      initial={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div
        className={cn(
          "relative px-4 py-3",
          !isError && "bg-gradient-to-r",
          !isError && meta.accent
        )}
      >
        <div className="relative flex items-center gap-3 text-white">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-black/20 ring-1 ring-white/20">
            {isComplete ? (
              <CheckCircle2Icon className="size-5" />
            ) : isError ? (
              <AlertCircleIcon className="size-5 text-white" />
            ) : (
              <Icon className="size-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-tight">
              {isError
                ? "Unduhan gagal"
                : isComplete
                  ? "Unduhan selesai"
                  : `Mengunduh ${meta.label}`}
            </p>
            <p className="truncate text-xs text-white/85">
              {progress.stageLabel}
              {!isError && !isComplete && (
                <span className="ml-1.5 tabular-nums opacity-90">
                  · {formatLabel}
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold tabular-nums tracking-tight">
              {isError ? "—" : `${Math.round(progress.progress)}%`}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3.5">
        <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/80">
          <motion.div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              isError
                ? "bg-destructive/70"
                : "bg-gradient-to-r from-primary via-violet-500 to-primary/80"
            )}
            initial={false}
            style={{ width: `${isError ? 100 : progress.progress}%` }}
            transition={{ type: "spring", stiffness: 120, damping: 22 }}
          />
          {isActive && !isError && !isComplete && (
            <motion.div
              animate={{ x: ["-100%", "220%"] }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
              transition={{
                duration: 1.4,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            />
          )}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {MEDIA_DOWNLOAD_STEPS.map((step, index) => {
            const done = isComplete || activeStep > index;
            const current = !isComplete && !isError && activeStep === index;
            return (
              <div
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center transition-colors",
                  current && "bg-primary/10",
                  done && !isError && "text-primary",
                  isError && index === activeStep && "text-destructive"
                )}
                key={step.key}
              >
                <div
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[10px] font-semibold",
                    done && !isError
                      ? "bg-primary/15 text-primary"
                      : current
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {done && !isError ? (
                    <CheckCircle2Icon className="size-3.5" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span className="text-[9px] leading-tight font-medium text-muted-foreground">
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {progress.bytesReceived != null && progress.bytesReceived > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {progress.format === "audio" ? (
              <Music2Icon className="size-3 shrink-0" />
            ) : (
              <VideoIcon className="size-3 shrink-0" />
            )}
            <span className="tabular-nums">
              {formatBytes(progress.bytesReceived)}
              {progress.bytesTotal
                ? ` / ${formatBytes(progress.bytesTotal)}`
                : ""}
            </span>
          </p>
        )}

        {isError && progress.error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs leading-relaxed text-destructive">
            {toErrorMessage(progress.error)}
          </p>
        )}

        {isComplete && progress.downloadUrl && (
          <a
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
            href={progress.downloadUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <DownloadIcon className="size-3.5" />
            Unduh file
          </a>
        )}
      </div>
    </motion.div>
  );
}
