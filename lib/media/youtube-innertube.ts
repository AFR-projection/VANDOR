import "server-only";

import { ClientType, Innertube, Utils } from "youtubei.js";

type YoutubeClient = "ANDROID_VR" | "IOS" | "WEB";
import { baseProgress, reportProgress } from "@/lib/media/progress";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
} from "@/lib/media/types";
import { extractYoutubeVideoId } from "@/lib/media/youtube-id";
import { toErrorMessage } from "@/lib/utils/error-message";

const CLIENT_CHAIN: Array<{ type: ClientType; label: YoutubeClient }> = [
  { type: ClientType.ANDROID_VR, label: "ANDROID_VR" },
  { type: ClientType.IOS, label: "IOS" },
  { type: ClientType.WEB, label: "WEB" },
];

function sanitizeTitle(title: string): string {
  return title.trim().slice(0, 120) || "youtube_video";
}

async function bufferFromStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: MediaDownloadProgressReporter | undefined,
  format: MediaDownloadFormat
): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastReport = 0;

  for await (const chunk of Utils.streamToIterable(stream)) {
    chunks.push(chunk);
    received += chunk.length;

    const now = Date.now();
    if (now - lastReport >= 120) {
      lastReport = now;
      const ratio = Math.min(0.92, received / (received + 512_000));
      reportProgress(
        onProgress,
        baseProgress("youtube", format, {
          status: "downloading",
          progress: 38 + Math.round(ratio * 40),
          stageLabel: `YouTube: ${Math.round(received / 1024 / 1024)} MB…`,
          bytesReceived: received,
        })
      );
    }
  }

  return Buffer.concat(chunks);
}

async function tryDownloadWithClient(
  videoId: string,
  format: MediaDownloadFormat,
  clientType: ClientType,
  clientLabel: YoutubeClient,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{ buffer: Buffer; title: string } | null> {
  const innertube = await Innertube.create({
    client_type: clientType,
    retrieve_player: true,
  });

  const info = await innertube.getBasicInfo(videoId);
  const title = sanitizeTitle(info.basic_info.title ?? "youtube_video");

  const hasStreams =
    (info.streaming_data?.formats?.length ?? 0) > 0 ||
    (info.streaming_data?.adaptive_formats?.length ?? 0) > 0;
  if (!hasStreams) {
    return null;
  }

  const stream = await innertube.download(videoId, {
    type: format === "audio" ? "audio" : "video",
    quality: format === "audio" ? "best" : "360p",
    format: "mp4",
    client: clientLabel,
  });

  const buffer = await bufferFromStream(stream, onProgress, format);
  if (buffer.length < 1024) {
    throw new Error(`Stream kosong (${buffer.length} byte).`);
  }

  return { buffer, title };
}

export async function downloadWithInnertube(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{ buffer: Buffer; title: string; filename: string }> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error("ID video YouTube tidak valid.");
  }

  reportProgress(
    onProgress,
    baseProgress("youtube", format, {
      status: "resolving",
      progress: 26,
      stageLabel: "YouTube: mengambil stream…",
    })
  );

  const errors: string[] = [];

  for (const { type, label } of CLIENT_CHAIN) {
    try {
      reportProgress(
        onProgress,
        baseProgress("youtube", format, {
          status: "resolving",
          progress: 28,
          stageLabel: `YouTube: client ${label}…`,
        })
      );

      const result = await tryDownloadWithClient(
        videoId,
        format,
        type,
        label,
        onProgress
      );
      if (!result) {
        errors.push(`${label}: streaming data tidak ada`);
        continue;
      }

      const ext = format === "audio" ? "m4a" : "mp4";
      const safeStem = result.title.replace(/\s+/g, "_").slice(0, 60);

      return {
        buffer: result.buffer,
        title: result.title,
        filename: `${safeStem}_${videoId}.${ext}`,
      };
    } catch (err) {
      errors.push(`${label}: ${toErrorMessage(err)}`);
    }
  }

  throw new Error(errors.join(" | ") || "InnerTube gagal untuk semua client.");
}
