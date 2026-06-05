import type {
  MediaDownloadFormat,
  MediaDownloadProgressData,
  MediaDownloadProgressReporter,
  MediaPlatform,
} from "@/lib/media/types";

export function reportProgress(
  onProgress: MediaDownloadProgressReporter | undefined,
  update: MediaDownloadProgressData
) {
  onProgress?.(update);
}

export function baseProgress(
  platform: MediaPlatform,
  format: MediaDownloadFormat,
  partial: Omit<MediaDownloadProgressData, "platform" | "format">
): MediaDownloadProgressData {
  return { platform, format, ...partial };
}

/** Smooth filler while waiting on yt-dlp / network without byte counts. */
export function startSimulatedDownloadProgress(
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat,
  from = 18,
  to = 68
): () => void {
  let current = from;
  const timer = setInterval(() => {
    current = Math.min(to, current + 1.2 + Math.random() * 2.5);
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "downloading",
        progress: Math.round(current),
        stageLabel: "Mengunduh dari sumber…",
      })
    );
  }, 450);
  return () => clearInterval(timer);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
