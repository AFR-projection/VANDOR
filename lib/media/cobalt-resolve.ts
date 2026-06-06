import "server-only";

import { formatCobaltApiError } from "@/lib/media/cobalt-error";
import {
  buildCobaltFetchHeaders,
  isCobaltTunnelUrl,
  isOnCobaltHost,
  normalizeHttpUrl,
  resolveCobaltApiBase,
  resolveCobaltDownloadUrl,
  type CobaltResponse,
} from "@/lib/media/cobalt-shared";
import { baseProgress, reportProgress } from "@/lib/media/progress";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
  MediaPlatform,
} from "@/lib/media/types";
import { toErrorMessage } from "@/lib/utils/error-message";

export type CobaltResolvedLink = {
  downloadUrl: string;
  title: string;
  filename?: string;
  status: string;
  fetchHeaders: Record<string, string>;
};

export async function requestCobaltDownload(
  url: string,
  format: MediaDownloadFormat,
  platform: MediaPlatform,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<CobaltResolvedLink> {
  const base = resolveCobaltApiBase();
  const apiKey = process.env.COBALT_API_KEY?.trim();

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Api-Key ${apiKey}`;
  }

  const body: Record<string, unknown> = {
    url,
    downloadMode: format === "audio" ? "audio" : "auto",
    audioFormat: "mp3",
    audioBitrate: "128",
    videoQuality: platform === "tiktok" ? "720" : "1080",
    filenameStyle: "basic",
    alwaysProxy: true,
  };
  if (platform === "youtube") {
    body.youtubeVideoCodec = "h264";
    body.youtubeVideoContainer = "mp4";
  }

  reportProgress(
    onProgress,
    baseProgress(platform, format, {
      status: "resolving",
      progress: 22,
      stageLabel: "Cobalt: menyiapkan link unduhan…",
    })
  );

  let res: Response;
  try {
    res = await fetch(`${base}/`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = toErrorMessage(err);
    if (/failed to parse url/i.test(msg)) {
      throw new Error(
        `Tidak bisa menghubungi Cobalt — periksa COBALT_API_URL (https://…). Nilai: ${process.env.COBALT_API_URL?.trim() || "(kosong)"}`
      );
    }
    throw err;
  }

  let data: CobaltResponse;
  try {
    data = (await res.json()) as CobaltResponse;
  } catch {
    throw new Error(
      `Cobalt respons bukan JSON (HTTP ${res.status}). Pastikan COBALT_API_URL benar.`
    );
  }

  if (!res.ok || data.status === "error") {
    throw new Error(formatCobaltApiError(data.error, res.status));
  }

  if (data.status === "picker") {
    throw new Error(
      "Link punya beberapa pilihan media — buka di browser atau coba link lain."
    );
  }

  if (data.status === "local-processing") {
    throw new Error("Cobalt butuh remux lokal — gunakan instance Cobalt Railway/VPS.");
  }

  if (!data.url) {
    throw new Error("Cobalt tidak mengembalikan URL unduhan.");
  }

  const downloadUrl = resolveCobaltDownloadUrl(base, data.url);
  if (
    platform === "youtube" &&
    data.status === "redirect" &&
    !isOnCobaltHost(base, downloadUrl)
  ) {
    throw new Error(
      "Cobalt redirect CDN — pakai alwaysProxy/tunnel (instance Cobalt sendiri)."
    );
  }

  const fetchHeaders = buildCobaltFetchHeaders({
    status: data.status,
    downloadUrl,
    cobaltBase: base,
    responseHeaders: data.headers,
    apiKey,
  });

  const title = data.filename?.replace(/\.[^.]+$/, "") ?? "media";

  return {
    downloadUrl: normalizeHttpUrl(downloadUrl, "URL unduhan Cobalt"),
    title,
    filename: data.filename,
    status: data.status,
    fetchHeaders,
  };
}

export function isCobaltTunnelLink(
  cobaltBase: string,
  downloadUrl: string,
  status: string
): boolean {
  return status === "tunnel" || isCobaltTunnelUrl(cobaltBase, downloadUrl);
}
