import "server-only";

import { baseProgress, reportProgress } from "@/lib/media/progress";
import { readResponseWithProgress } from "@/lib/media/stream-fetch";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
} from "@/lib/media/types";
import { extractYoutubeVideoId } from "@/lib/media/youtube-id";
import { toErrorMessage } from "@/lib/utils/error-message";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

const PIPED_API_BASES = [
  process.env.PIPED_API_URL?.trim(),
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
].filter((value): value is string => Boolean(value));

const INVIDIOUS_INSTANCES = [
  process.env.INVIDIOUS_INSTANCE_URL?.trim(),
  "https://yewtu.be",
  "https://vid.puffyan.us",
  "https://inv.nadeko.net",
].filter((value): value is string => Boolean(value));

type PipedStream = {
  url?: string;
  mimeType?: string;
  quality?: string;
  format?: string;
  videoOnly?: boolean;
  bitrate?: number;
};

type PipedResponse = {
  title?: string;
  videoStreams?: PipedStream[];
  audioStreams?: PipedStream[];
};

type InvidiousFormat = {
  url?: string;
  type?: string;
  container?: string;
  qualityLabel?: string;
  resolution?: string;
  audioQuality?: string;
  clen?: string;
};

type InvidiousVideo = {
  title?: string;
  formatStreams?: InvidiousFormat[];
  adaptiveFormats?: InvidiousFormat[];
};

function sanitizeTitle(title: string): string {
  return title.trim().slice(0, 120) || "youtube_video";
}

function qualityRank(label?: string): number {
  if (!label) {
    return 0;
  }
  const match = /(\d+)\s*p/i.exec(label);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function pickPipedVideoStream(streams: PipedStream[]): PipedStream | null {
  const valid = streams.filter((stream) => stream.url?.trim());
  const muxed = valid.filter((stream) => !stream.videoOnly);
  const pool =
    muxed.length > 0
      ? muxed
      : valid.filter((stream) =>
          /mp4|video/i.test(stream.mimeType ?? stream.format ?? "")
        );
  if (pool.length === 0) {
    return valid[0] ?? null;
  }
  return (
    pool.sort(
      (left, right) => qualityRank(right.quality) - qualityRank(left.quality)
    )[0] ?? null
  );
}

function pickPipedAudioStream(streams: PipedStream[]): PipedStream | null {
  const valid = streams.filter((stream) => stream.url?.trim());
  if (valid.length === 0) {
    return null;
  }
  return (
    valid.sort(
      (left, right) => (right.bitrate ?? 0) - (left.bitrate ?? 0)
    )[0] ?? null
  );
}

function pickInvidiousVideoStream(
  formats: InvidiousFormat[]
): InvidiousFormat | null {
  const valid = formats.filter((format) => format.url?.trim());
  const mp4 = valid.filter(
    (format) =>
      /mp4/i.test(format.container ?? "") ||
      /video\/mp4/i.test(format.type ?? "")
  );
  const pool = mp4.length > 0 ? mp4 : valid;
  if (pool.length === 0) {
    return null;
  }
  return (
    pool.sort(
      (left, right) =>
        qualityRank(right.qualityLabel ?? right.resolution) -
        qualityRank(left.qualityLabel ?? left.resolution)
    )[0] ?? null
  );
}

function pickInvidiousAudioStream(
  formats: InvidiousFormat[]
): InvidiousFormat | null {
  const valid = formats.filter(
    (format) =>
      format.url?.trim() &&
      /^audio\//i.test(format.type ?? "") &&
      !/video/i.test(format.type ?? "")
  );
  if (valid.length === 0) {
    return null;
  }
  return (
    valid.sort((left, right) => {
      const leftSize = Number.parseInt(left.clen ?? "0", 10);
      const rightSize = Number.parseInt(right.clen ?? "0", 10);
      return rightSize - leftSize;
    })[0] ?? null
  );
}

async function fetchStreamBuffer(
  streamUrl: string,
  onProgress: MediaDownloadProgressReporter | undefined,
  format: MediaDownloadFormat,
  label: string
): Promise<Buffer> {
  const res = await fetch(streamUrl, {
    headers: FETCH_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  const buffer = await readResponseWithProgress(
    res,
    onProgress,
    "youtube",
    format,
    { from: 38, to: 78 },
    label
  );
  if (buffer.length < 1024) {
    throw new Error(`Stream YouTube kosong (${buffer.length} byte).`);
  }
  return buffer;
}

async function downloadWithPiped(
  videoId: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{ buffer: Buffer; title: string; filename: string }> {
  reportProgress(
    onProgress,
    baseProgress("youtube", format, {
      status: "resolving",
      progress: 28,
      stageLabel: "YouTube: mengambil link via Piped…",
    })
  );

  let payload: PipedResponse | null = null;
  for (const base of PIPED_API_BASES) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/streams/${videoId}`, {
        headers: FETCH_HEADERS,
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        continue;
      }
      const data = (await res.json()) as PipedResponse;
      if (data.title) {
        payload = data;
        break;
      }
    } catch {
      // try next instance
    }
  }

  if (!payload?.title) {
    throw new Error("Piped tidak dapat metadata video.");
  }

  const stream =
    format === "audio"
      ? pickPipedAudioStream(payload.audioStreams ?? [])
      : pickPipedVideoStream(payload.videoStreams ?? []);
  if (!stream?.url) {
    throw new Error("Piped tidak menemukan stream untuk format ini.");
  }

  const title = sanitizeTitle(payload.title);
  const ext = format === "audio" ? "m4a" : "mp4";
  const buffer = await fetchStreamBuffer(
    stream.url,
    onProgress,
    format,
    "YouTube"
  );

  return {
    buffer,
    title,
    filename: `${title.replace(/\s+/g, "_").slice(0, 60)}_${videoId}.${ext}`,
  };
}

async function downloadWithInvidious(
  videoId: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{ buffer: Buffer; title: string; filename: string }> {
  reportProgress(
    onProgress,
    baseProgress("youtube", format, {
      status: "resolving",
      progress: 30,
      stageLabel: "YouTube: fallback Invidious…",
    })
  );

  let payload: InvidiousVideo | null = null;
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(
        `${base.replace(/\/$/, "")}/api/v1/videos/${videoId}?local=1`,
        {
          headers: FETCH_HEADERS,
          signal: AbortSignal.timeout(45_000),
        }
      );
      if (!res.ok) {
        continue;
      }
      const data = (await res.json()) as InvidiousVideo;
      if (data.title) {
        payload = data;
        break;
      }
    } catch {
      // try next instance
    }
  }

  if (!payload?.title) {
    throw new Error("Invidious tidak dapat metadata video.");
  }

  const stream =
    format === "audio"
      ? pickInvidiousAudioStream(payload.adaptiveFormats ?? [])
      : pickInvidiousVideoStream(payload.formatStreams ?? []);
  if (!stream?.url) {
    throw new Error("Invidious tidak menemukan stream untuk format ini.");
  }

  const title = sanitizeTitle(payload.title);
  const ext = format === "audio" ? "m4a" : "mp4";
  const buffer = await fetchStreamBuffer(
    stream.url,
    onProgress,
    format,
    "YouTube"
  );

  return {
    buffer,
    title,
    filename: `${title.replace(/\s+/g, "_").slice(0, 60)}_${videoId}.${ext}`,
  };
}

export async function downloadYoutubeViaFallback(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{
  buffer: Buffer;
  title: string;
  filename: string;
  backend: "piped" | "invidious";
}> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error("ID video YouTube tidak valid.");
  }

  let pipedErr: unknown;
  try {
    const piped = await downloadWithPiped(videoId, format, onProgress);
    return { ...piped, backend: "piped" };
  } catch (err) {
    pipedErr = err;
  }

  try {
    const invidious = await downloadWithInvidious(videoId, format, onProgress);
    return { ...invidious, backend: "invidious" };
  } catch (invidiousErr) {
    throw new Error(
      `Piped: ${toErrorMessage(pipedErr)}. Invidious: ${toErrorMessage(invidiousErr)}`
    );
  }
}
