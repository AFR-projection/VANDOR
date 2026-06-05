import "server-only";

import { baseProgress, reportProgress } from "@/lib/media/progress";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
} from "@/lib/media/types";
import { toErrorMessage } from "@/lib/utils/error-message";

const TIKWM_API = "https://www.tikwm.com/api/";
const TIKWM_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "application/json",
};

type TikwmResponse = {
  code?: number;
  msg?: string;
  data?: {
    title?: string;
    play?: string;
    hdplay?: string;
    wmplay?: string;
    music?: string;
    duration?: number;
    id?: string;
  };
};

function pickTikwmStreamUrl(
  data: NonNullable<TikwmResponse["data"]>,
  format: MediaDownloadFormat
): string | null {
  if (format === "audio") {
    return data.music?.trim() || null;
  }
  return (
    data.hdplay?.trim() || data.play?.trim() || data.wmplay?.trim() || null
  );
}

async function callTikwmApi(url: string): Promise<TikwmResponse> {
  const endpoint = `${TIKWM_API}?url=${encodeURIComponent(url)}&hd=1`;
  const res = await fetch(endpoint, {
    headers: TIKWM_HEADERS,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    throw new Error(`TikWM API HTTP ${res.status}`);
  }
  return (await res.json()) as TikwmResponse;
}

async function fetchTikwmWithRetry(url: string): Promise<TikwmResponse> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const payload = await callTikwmApi(url);
      if (payload.code === 0 && payload.data) {
        return payload;
      }
      const msg = payload.msg?.trim() || "TikWM tidak mengembalikan data";
      if (attempt === 0 && /wait|short link|try again/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 4500));
        continue;
      }
      throw new Error(msg);
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(toErrorMessage(lastErr));
}

export async function downloadWithTikwm(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{ buffer: Buffer; title: string; filename?: string }> {
  reportProgress(
    onProgress,
    baseProgress("tiktok", format, {
      status: "resolving",
      progress: 24,
      stageLabel: "TikTok: mengambil link via TikWM…",
    })
  );

  const payload = await fetchTikwmWithRetry(url);
  const streamUrl = pickTikwmStreamUrl(payload.data ?? {}, format);
  if (!streamUrl) {
    throw new Error("TikWM tidak menemukan stream video/audio untuk link ini.");
  }

  const title =
    payload.data?.title?.trim().slice(0, 120) ||
    `tiktok_${payload.data?.id ?? "video"}`;

  reportProgress(
    onProgress,
    baseProgress("tiktok", format, {
      status: "downloading",
      progress: 42,
      stageLabel: "TikTok: mengunduh file…",
    })
  );

  const res = await fetch(streamUrl, {
    headers: {
      ...TIKWM_HEADERS,
      Referer: "https://www.tiktok.com/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(`Unduhan TikTok gagal (HTTP ${res.status})`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(
      "File TikTok kosong — coba link lain atau tunggu beberapa detik."
    );
  }

  const ext = format === "audio" ? "mp3" : "mp4";
  const safeId = payload.data?.id ?? Date.now().toString();

  return {
    buffer,
    title,
    filename: `tiktok_${safeId}.${ext}`,
  };
}
