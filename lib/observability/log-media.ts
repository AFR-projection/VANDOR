import "server-only";

import type { MediaDownloadResult } from "@/lib/media/types";
import { recordActivityLog } from "@/lib/observability/record";
import { toErrorMessage } from "@/lib/utils/error-message";

function formatSize(sizeBytes?: number): string {
  if (sizeBytes == null) {
    return "?";
  }
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

export function recordMediaDownloadLog(input: {
  userId: string;
  chatId?: string | null;
  command: string;
  url: string;
  result: MediaDownloadResult;
}): void {
  const { userId, chatId, command, url, result } = input;
  const source = `media/${command}`;

  if (result.ok) {
    recordActivityLog({
      userId,
      chatId,
      source,
      level: "success",
      message: `Unduhan ${result.platform} ${result.format} berhasil (${formatSize(result.sizeBytes)})`,
      detail: [
        `backend=${result.backend ?? "?"}`,
        `url=${url.slice(0, 120)}`,
        result.url ? `file=${result.url}` : null,
        result.title ? `title=${result.title.slice(0, 80)}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    }).catch(() => null);
    return;
  }

  recordActivityLog({
    userId,
    chatId,
    source,
    level: "error",
    message: `Unduhan ${result.platform} ${result.format} gagal`,
    detail: `${toErrorMessage(result.error)}\nurl=${url.slice(0, 120)}`,
  }).catch(() => null);
}
