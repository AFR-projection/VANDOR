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

const RESOLVING_LABELS = [
  "Menghubungi sumber…",
  "Mengurai metadata…",
  "Menyiapkan stream…",
  "Mengambil tautan unduhan…",
];

/** Pulse saat resolving — terasa live meski belum ada byte count. */
export function startResolvingPulse(
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat,
  from = 12,
  to = 22
): () => void {
  let current = from;
  let labelIndex = 0;
  const timer = setInterval(() => {
    current = Math.min(to, current + 0.35 + Math.random() * 0.9);
    labelIndex = (labelIndex + 1) % RESOLVING_LABELS.length;
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "resolving",
        progress: Math.round(current),
        stageLabel: RESOLVING_LABELS[labelIndex],
      })
    );
  }, 320);
  return () => clearInterval(timer);
}

/** Smooth filler while waiting on yt-dlp / network without byte counts. */
export function startSimulatedDownloadProgress(
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat,
  from = 28,
  to = 72
): () => void {
  let current = from;
  let fakeBytes = 0;
  const timer = setInterval(() => {
    current = Math.min(to, current + 0.6 + Math.random() * 1.8);
    fakeBytes += Math.round(24_000 + Math.random() * 48_000);
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "downloading",
        progress: Math.round(current),
        stageLabel: "Mengunduh dari sumber…",
        bytesReceived: fakeBytes,
      })
    );
  }, 280);
  return () => clearInterval(timer);
}

/** Animasi upload cloud saat putFile berjalan. */
export function startUploadProgressSimulation(
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat,
  sizeBytes: number
): () => void {
  let current = 82;
  const timer = setInterval(() => {
    current = Math.min(96, current + 0.5 + Math.random() * 1.2);
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "uploading",
        progress: Math.round(current),
        stageLabel: "Mengunggah ke cloud…",
        bytesReceived: sizeBytes,
        bytesTotal: sizeBytes,
      })
    );
  }, 220);
  return () => clearInterval(timer);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
