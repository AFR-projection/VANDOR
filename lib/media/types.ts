export type MediaPlatform = "tiktok" | "youtube" | "instagram";

export type MediaDownloadFormat = "video" | "audio";

export type MediaDownloadStage =
  | "validating"
  | "resolving"
  | "downloading"
  | "uploading"
  | "complete"
  | "error";

export type MediaDownloadProgressData = {
  status: MediaDownloadStage;
  /** 0–100 */
  progress: number;
  stageLabel: string;
  platform?: MediaPlatform;
  format?: MediaDownloadFormat;
  bytesReceived?: number;
  bytesTotal?: number;
  downloadUrl?: string;
  title?: string;
  error?: string;
};

export type MediaDownloadProgressReporter = (
  update: MediaDownloadProgressData
) => void;

export type MediaDownloadResult = {
  ok: boolean;
  url?: string;
  filename?: string;
  title?: string;
  platform: MediaPlatform;
  format: MediaDownloadFormat;
  sizeBytes?: number;
  contentType?: string;
  backend?: "yt-dlp" | "cobalt" | "tikwm" | "piped" | "invidious";
  error?: string;
};

export const MEDIA_DOWNLOAD_STEPS = [
  { key: "validating" as const, label: "Validasi link" },
  { key: "resolving" as const, label: "Ambil media" },
  { key: "downloading" as const, label: "Unduh file" },
  { key: "uploading" as const, label: "Upload cloud" },
] as const;
