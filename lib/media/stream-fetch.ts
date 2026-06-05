import "server-only";

import {
  baseProgress,
  formatBytes,
  reportProgress,
} from "@/lib/media/progress";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
  MediaPlatform,
} from "@/lib/media/types";

const PROGRESS_THROTTLE_MS = 120;

export async function readResponseWithProgress(
  res: Response,
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat,
  range: { from: number; to: number },
  stagePrefix = "Mengunduh"
): Promise<Buffer> {
  if (!res.ok) {
    throw new Error(`Unduhan gagal (HTTP ${res.status})`);
  }

  const total = Number(res.headers.get("content-length")) || 0;
  const body = res.body;

  if (!body) {
    const buf = Buffer.from(await res.arrayBuffer());
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "downloading",
        progress: range.to,
        stageLabel: `${stagePrefix}… ${formatBytes(buf.length)}`,
        bytesReceived: buf.length,
        bytesTotal: buf.length || undefined,
      })
    );
    return buf;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastReport = 0;

  const emit = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < PROGRESS_THROTTLE_MS) {
      return;
    }
    lastReport = now;

    const ratio =
      total > 0
        ? Math.min(1, received / total)
        : Math.min(0.92, received / (received + 512_000));
    const span = range.to - range.from;
    const progress = range.from + Math.round(ratio * span);

    const label =
      total > 0
        ? `${stagePrefix}… ${formatBytes(received)} / ${formatBytes(total)}`
        : `${stagePrefix}… ${formatBytes(received)}`;

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "downloading",
        progress,
        stageLabel: label,
        bytesReceived: received,
        bytesTotal: total || undefined,
      })
    );
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      emit();
    }
  }

  emit(true);
  return Buffer.concat(chunks);
}
