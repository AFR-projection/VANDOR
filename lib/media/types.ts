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
  filename?: string;
  title?: string;
  error?: string;
};

export type MediaDownloadProgressReporter = (
  update: MediaDownloadProgressData
) => void;

export type MediaDownloadResult = {
  ok: boolean;
  url?: string;
  /** Buffer mentah — untuk WhatsApp (tanpa re-fetch R2 yang butuh auth). */
  buffer?: Buffer;
  filename?: string;
  title?: string;
  platform: MediaPlatform;
  format: MediaDownloadFormat;
  sizeBytes?: number;
  contentType?: string;
  backend?:
    | "yt-dlp"
    | "cobalt"
    | "tikwm"
    | "piped"
    | "invidious"
    | "innertube"
    | "ytdlp";
  /** direct = link Cobalt di browser; blob = file di storage VANDOR */
  delivery?: "direct" | "blob";
  error?: string;
};

export const MEDIA_DOWNLOAD_STEPS = [
  { key: "validating" as const, label: "Validasi link" },
  { key: "resolving" as const, label: "Ambil media" },
  { key: "downloading" as const, label: "Unduh file" },
  { key: "uploading" as const, label: "Upload cloud" },
] as const;
