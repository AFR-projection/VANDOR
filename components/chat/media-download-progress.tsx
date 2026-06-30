"use client";

import {
  motion,
  useMotionValueEvent,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  InstagramIcon,
  Music2Icon,
  RadioIcon,
  SparklesIcon,
  VideoIcon,
  ZapIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { triggerMediaDownload } from "@/components/security/pin-confirm-dialog";
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
        accent: "from-pink-500 via-rose-500 to-cyan-400",
        glow: "shadow-pink-500/25",
        ring: "stroke-pink-400",
      };
    case "instagram":
      return {
        label: "Instagram",
        icon: InstagramIcon,
        accent: "from-violet-500 via-fuchsia-500 to-orange-400",
        glow: "shadow-fuchsia-500/25",
        ring: "stroke-fuchsia-400",
      };
    case "youtube":
      return {
        label: "YouTube",
        icon: VideoIcon,
        accent: "from-red-600 via-red-500 to-orange-400",
        glow: "shadow-red-500/30",
        ring: "stroke-red-400",
      };
    default:
      return {
        label: "Media",
        icon: DownloadIcon,
        accent: "from-primary via-violet-500 to-cyan-400",
        glow: "shadow-primary/20",
        ring: "stroke-primary",
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

function formatSpeed(bps: number): string {
  if (bps < 1024) return `${Math.round(bps)} B/s`;
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${(bps / 1024 / 1024).toFixed(1)} MB/s`;
}

function useLiveDownloadStats(
  progress: MediaDownloadProgressData,
  isActive: boolean
) {
  const [speedBps, setSpeedBps] = useState(0);
  const lastRef = useRef({ bytes: 0, at: Date.now() });

  useEffect(() => {
    if (!isActive) {
      setSpeedBps(0);
      return;
    }
    const bytes = progress.bytesReceived ?? 0;
    const now = Date.now();
    const elapsed = (now - lastRef.current.at) / 1000;
    if (elapsed >= 0.15 && bytes >= lastRef.current.bytes) {
      const delta = bytes - lastRef.current.bytes;
      if (delta > 0) {
        setSpeedBps(delta / elapsed);
      }
      lastRef.current = { bytes, at: now };
    }
  }, [progress.bytesReceived, progress.progress, isActive]);

  const spring = useSpring(progress.progress, {
    stiffness: 90,
    damping: 18,
    mass: 0.6,
  });
  const displayPct = useTransform(spring, (v) => Math.round(v));
  const [pctLabel, setPctLabel] = useState(Math.round(progress.progress));

  useEffect(() => {
    spring.set(progress.progress);
  }, [progress.progress, spring]);

  useMotionValueEvent(displayPct, "change", (v) => {
    setPctLabel(v);
  });

  const etaSec =
    isActive && progress.bytesTotal && progress.bytesReceived && speedBps > 8000
      ? Math.max(
          0,
          Math.ceil((progress.bytesTotal - progress.bytesReceived) / speedBps)
        )
      : null;

  return { speedBps, pctLabel, etaSec };
}

function ProgressRing({
  value,
  className,
  strokeClass,
}: {
  value: number;
  className?: string;
  strokeClass: string;
}) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;

  return (
    <svg
      aria-hidden
      className={cn("size-11 -rotate-90", className)}
      viewBox="0 0 44 44"
    >
      <circle
        className="stroke-white/15"
        cx="22"
        cy="22"
        fill="none"
        r={r}
        strokeWidth="3"
      />
      <motion.circle
        animate={{ strokeDashoffset: offset }}
        className={cn(strokeClass, "drop-shadow-sm")}
        cx="22"
        cy="22"
        fill="none"
        initial={false}
        r={r}
        strokeDasharray={c}
        strokeLinecap="round"
        strokeWidth="3"
        transition={{ type: "spring", stiffness: 80, damping: 20 }}
      />
    </svg>
  );
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
  const { speedBps, pctLabel, etaSec } = useLiveDownloadStats(
    progress,
    isActive
  );

  const filename =
    progress.filename ??
    (progress.title
      ? `${progress.title}.${progress.format === "audio" ? "mp3" : "mp4"}`
      : `vandor-${progress.platform ?? "media"}.${progress.format === "audio" ? "mp3" : "mp4"}`);

  const handleDownload = useCallback(() => {
    if (!progress.downloadUrl) return;
    void triggerMediaDownload(progress.downloadUrl, filename);
  }, [progress.downloadUrl, filename]);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "relative w-full max-w-md overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl",
        isError
          ? "border-destructive/40 bg-destructive/5"
          : cn(
              "border-border/40 bg-card/90",
              meta.glow,
              isActive && "shadow-2xl"
            )
      )}
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {isActive && !isError && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl opacity-60"
          style={{
            background:
              "conic-gradient(from 0deg, transparent, hsl(var(--primary) / 0.35), transparent)",
            animation: "vandor-download-ring 3s linear infinite",
          }}
        />
      )}

      <div
        className={cn(
          "relative overflow-hidden px-4 py-3.5",
          !isError && "bg-gradient-to-r",
          !isError && meta.accent
        )}
      >
        {!isError && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/5"
              style={{
                animation: "vandor-download-aurora 4s ease-in-out infinite",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(255,255,255,0.35), transparent 60%)",
              }}
            />
          </>
        )}

        <div className="relative flex items-center gap-3 text-white">
          <div className="relative flex size-11 shrink-0 items-center justify-center">
            {!isError && !isComplete && (
              <ProgressRing strokeClass={meta.ring} value={progress.progress} />
            )}
            <div
              className={cn(
                "absolute inset-1 flex items-center justify-center rounded-full bg-black/25 ring-1 ring-white/25 backdrop-blur-sm",
                isActive && !isError && "animate-pulse"
              )}
            >
              {isComplete ? (
                <motion.div
                  animate={{ scale: [0.6, 1.15, 1] }}
                  initial={{ scale: 0.6 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14 }}
                >
                  <CheckCircle2Icon className="size-5" />
                </motion.div>
              ) : isError ? (
                <AlertCircleIcon className="size-5" />
              ) : (
                <Icon className="size-4" />
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold tracking-tight">
                {isError
                  ? "Unduhan gagal"
                  : isComplete
                    ? "Unduhan selesai"
                    : `Mengunduh ${meta.label}`}
              </p>
              {isActive && !isError && (
                <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-white/20">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300 opacity-80" />
                    <span className="relative size-1.5 rounded-full bg-emerald-300" />
                  </span>
                  Live
                </span>
              )}
            </div>
            <motion.p
              animate={{ opacity: 1 }}
              className="truncate text-xs text-white/90"
              initial={{ opacity: 0.7 }}
              key={progress.stageLabel}
              transition={{ duration: 0.25 }}
            >
              {progress.stageLabel}
              {!isError && !isComplete && (
                <span className="ml-1.5 tabular-nums opacity-90">
                  · {formatLabel}
                </span>
              )}
            </motion.p>
          </div>

          <div className="text-right">
            <motion.span className="block text-xl font-bold tabular-nums tracking-tight">
              {isError ? "—" : pctLabel}
              {!isError && (
                <span className="text-sm font-semibold opacity-80">%</span>
              )}
            </motion.span>
          </div>
        </div>
      </div>

      <div className="relative space-y-3.5 px-4 py-4">
        <div className="relative h-3 overflow-hidden rounded-full bg-muted/70 ring-1 ring-border/30">
          <motion.div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              isError
                ? "bg-destructive/80"
                : "bg-gradient-to-r from-primary via-violet-500 to-cyan-400"
            )}
            initial={false}
            style={{ width: `${isError ? 100 : progress.progress}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 20 }}
          />
          {isActive && !isError && (
            <div
              aria-hidden
              className="absolute inset-y-0 w-2/5 bg-gradient-to-r from-transparent via-white/60 to-transparent"
              style={{
                animation: "vandor-download-shimmer 1.1s linear infinite",
              }}
            />
          )}
          {isComplete && (
            <motion.div
              animate={{ opacity: [0.4, 0, 0.4] }}
              className="absolute inset-0 bg-gradient-to-r from-emerald-400/30 via-white/20 to-emerald-400/30"
              transition={{ duration: 1.2, repeat: 2 }}
            />
          )}
        </div>

        <div className="relative flex items-start justify-between gap-1">
          {MEDIA_DOWNLOAD_STEPS.map((step, index) => {
            const done = isComplete || activeStep > index;
            const current = !isComplete && !isError && activeStep === index;
            const StepIcon =
              index === 0
                ? ZapIcon
                : index === 1
                  ? RadioIcon
                  : index === 2
                    ? progress.format === "audio"
                      ? Music2Icon
                      : VideoIcon
                    : SparklesIcon;

            return (
              <div
                className="relative flex flex-1 flex-col items-center"
                key={step.key}
              >
                {index < MEDIA_DOWNLOAD_STEPS.length - 1 && (
                  <div
                    aria-hidden
                    className="absolute top-3 left-[calc(50%+14px)] h-0.5 w-[calc(100%-28px)] overflow-hidden rounded-full bg-muted"
                  >
                    <motion.div
                      animate={{
                        width: done ? "100%" : current ? "45%" : "0%",
                      }}
                      className="h-full bg-gradient-to-r from-primary/80 to-violet-500/80"
                      initial={false}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                )}
                <motion.div
                  animate={
                    current
                      ? {
                          scale: [1, 1.08, 1],
                          boxShadow: "0 0 0 4px hsl(var(--primary) / 0.12)",
                        }
                      : { scale: 1, boxShadow: "0 0 0 0px transparent" }
                  }
                  className={cn(
                    "relative z-10 flex size-7 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                    done && !isError
                      ? "bg-primary text-primary-foreground shadow-md"
                      : current
                        ? "bg-primary text-primary-foreground shadow-lg"
                        : "bg-muted text-muted-foreground"
                  )}
                  transition={
                    current
                      ? { duration: 1.2, repeat: Number.POSITIVE_INFINITY }
                      : { duration: 0.3 }
                  }
                >
                  {done && !isError ? (
                    <CheckCircle2Icon className="size-3.5" />
                  ) : (
                    <StepIcon className="size-3.5" />
                  )}
                </motion.div>
                <span
                  className={cn(
                    "mt-1.5 text-center text-[9px] leading-tight font-medium",
                    current ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {(progress.bytesReceived != null && progress.bytesReceived > 0) ||
        (isActive && speedBps > 0) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/40 bg-muted/30 px-3 py-2">
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {progress.format === "audio" ? (
                <Music2Icon className="size-3 shrink-0 text-violet-500" />
              ) : (
                <VideoIcon className="size-3 shrink-0 text-violet-500" />
              )}
              <span className="font-medium text-foreground/90 tabular-nums">
                {formatBytes(progress.bytesReceived ?? 0)}
                {progress.bytesTotal
                  ? ` / ${formatBytes(progress.bytesTotal)}`
                  : ""}
              </span>
            </p>
            {isActive && speedBps > 4000 && (
              <p className="text-[10px] font-semibold text-primary tabular-nums">
                {formatSpeed(speedBps)}
                {etaSec != null && etaSec > 0 && (
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · ~{etaSec}s
                  </span>
                )}
              </p>
            )}
          </div>
        ) : null}

        {isError && progress.error && (
          <motion.p
            animate={{ x: [0, -4, 4, -2, 2, 0] }}
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs leading-relaxed text-destructive"
            transition={{ duration: 0.45 }}
          >
            {toErrorMessage(progress.error)}
          </motion.p>
        )}

        {isComplete && progress.downloadUrl && (
          <motion.button
            animate={{ opacity: 1, y: 0 }}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-[1.01] active:scale-[0.99]"
            initial={{ opacity: 0, y: 6 }}
            onClick={handleDownload}
            transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
            type="button"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
              style={{
                animation: "vandor-download-shimmer 1.4s linear infinite",
              }}
            />
            <DownloadIcon className="size-4" />
            Unduh ke perangkat
          </motion.button>
        )}

        {isComplete && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-2 flex justify-center gap-3"
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                className="size-1 rounded-full bg-primary/50"
                key={`spark-${i}`}
                style={{
                  animation: `vandor-download-spark 1.2s ease ${i * 0.12}s 2`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
