import "server-only";

import { baseProgress, reportProgress } from "@/lib/media/progress";
import { readResponseWithProgress } from "@/lib/media/stream-fetch";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
} from "@/lib/media/types";
import { toErrorMessage } from "@/lib/utils/error-message";

/** Pakai YTDLP_API_URL eksplisit, atau otomatis COBALT_API_URL + /ytdlp (tanpa env baru). */
function resolveYtdlpApiBase(): string | null {
  const explicit = process.env.YTDLP_API_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (process.env.VANDOR_DISABLE_YTDLP_ON_COBALT === "1") {
    return null;
  }
  const cobalt = process.env.COBALT_API_URL?.trim();
  if (!cobalt) {
    return null;
  }
  let base = cobalt;
  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base.replace(/^\/+/, "")}`;
  }
  return `${base.replace(/\/$/, "")}/ytdlp`;
}

function resolveYtdlpApiKey(): string | undefined {
  return (
    process.env.YTDLP_API_KEY?.trim() ||
    process.env.COBALT_API_KEY?.trim() ||
    undefined
  );
}

export function hasYtdlpApiBackend(): boolean {
  return Boolean(resolveYtdlpApiBase());
}

function sanitizeFilename(raw: string, format: MediaDownloadFormat): string {
  const base = raw
    .replace(/[^\w\s.-]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  const ext = format === "audio" ? "mp3" : "mp4";
  return base.endsWith(`.${ext}`) ? base : `${base || "youtube"}.${ext}`;
}

export async function downloadWithYtdlpApi(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{ buffer: Buffer; title: string; filename: string }> {
  const base = resolveYtdlpApiBase();
  if (!base) {
    throw new Error("yt-dlp belum tersedia di server unduhan.");
  }

  reportProgress(
    onProgress,
    baseProgress("youtube", format, {
      status: "resolving",
      progress: 24,
      stageLabel: "YouTube: yt-dlp…",
    })
  );

  const apiKey = resolveYtdlpApiKey();
  const endpoint = new URL("/download", `${base}/`);
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("format", format);

  const headers: Record<string, string> = { Accept: "*/*" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["Api-Key"] = apiKey;
  }

  let res: Response;
  try {
    res = await fetch(endpoint.toString(), {
      headers,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    throw new Error(`yt-dlp tidak terjangkau: ${toErrorMessage(err)}`);
  }

  if (res.status === 404) {
    throw new Error(
      "yt-dlp belum dipasang di Railway Cobalt — ganti root folder ke services/cobalt-ytdlp lalu redeploy."
    );
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const json = (await res.json()) as { error?: string };
      if (json.error) {
        detail = json.error;
      }
    } catch {
      detail = (await res.text()).slice(0, 200) || detail;
    }
    throw new Error(detail);
  }

  const title =
    res.headers.get("x-vandor-title")?.trim() ||
    res.headers.get("X-Vandor-Title")?.trim() ||
    "youtube_video";
  const suggestedFilename =
    res.headers.get("x-vandor-filename")?.trim() ||
    res.headers.get("X-Vandor-Filename")?.trim();

  reportProgress(
    onProgress,
    baseProgress("youtube", format, {
      status: "downloading",
      progress: 40,
      stageLabel: "YouTube: menerima file…",
    })
  );

  const buffer = await readResponseWithProgress(
    res,
    onProgress,
    "youtube",
    format,
    { from: 38, to: 78 },
    "YouTube"
  );

  if (buffer.length < 1024) {
    throw new Error(`File yt-dlp kosong (${buffer.length} byte).`);
  }

  return {
    buffer,
    title,
    filename: sanitizeFilename(suggestedFilename ?? title, format),
  };
}
