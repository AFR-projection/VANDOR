import "server-only";

import { ClientType, Innertube } from "youtubei.js";
import { baseProgress, reportProgress } from "@/lib/media/progress";
import { readResponseWithProgress } from "@/lib/media/stream-fetch";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
} from "@/lib/media/types";
import { extractYoutubeVideoId } from "@/lib/media/youtube-id";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

let clientPromise: Promise<Innertube> | null = null;

function getInnertubeClient(): Promise<Innertube> {
  if (!clientPromise) {
    clientPromise = Innertube.create({
      client_type: ClientType.ANDROID_VR,
      retrieve_player: true,
    });
  }
  return clientPromise;
}

function sanitizeTitle(title: string): string {
  return title.trim().slice(0, 120) || "youtube_video";
}

function pickMuxedVideoFormat(
  info: Awaited<ReturnType<Innertube["getBasicInfo"]>>
) {
  const muxed = [...(info.streaming_data?.formats ?? [])].sort(
    (left, right) => (right.height ?? 0) - (left.height ?? 0)
  );
  return muxed.find(
    (format) => format.url && /mp4/i.test(format.mime_type ?? "")
  );
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

  const innertube = await getInnertubeClient();
  const info = await innertube.getBasicInfo(videoId);
  const title = sanitizeTitle(info.basic_info.title ?? "youtube_video");

  let streamUrl: string | undefined;
  const ext = format === "audio" ? "m4a" : "mp4";

  if (format === "audio") {
    const audioFormat = info.chooseFormat({ type: "audio", quality: "best" });
    streamUrl = audioFormat?.url;
    if (!streamUrl && audioFormat) {
      streamUrl = await audioFormat.decipher(innertube.session.player);
    }
  } else {
    const videoFormat =
      pickMuxedVideoFormat(info) ??
      info.chooseFormat({ type: "video", quality: "360p", format: "mp4" });
    streamUrl = videoFormat?.url;
    if (!streamUrl && videoFormat) {
      streamUrl = await videoFormat.decipher(innertube.session.player);
    }
  }

  if (!streamUrl) {
    throw new Error(
      "Stream YouTube tidak ditemukan (format dibatasi YouTube)."
    );
  }

  reportProgress(
    onProgress,
    baseProgress("youtube", format, {
      status: "downloading",
      progress: 42,
      stageLabel: "YouTube: mengunduh file…",
    })
  );

  const res = await fetch(streamUrl, {
    headers: { "User-Agent": ANDROID_UA, Accept: "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });

  const buffer = await readResponseWithProgress(
    res,
    onProgress,
    "youtube",
    format,
    { from: 38, to: 78 },
    "YouTube"
  );

  if (buffer.length < 1024) {
    throw new Error(`Stream YouTube kosong (${buffer.length} byte).`);
  }

  const safeStem = title.replace(/\s+/g, "_").slice(0, 60);

  return {
    buffer,
    title,
    filename: `${safeStem}_${videoId}.${ext}`,
  };
}
