import "server-only";

import { formatCobaltApiError } from "@/lib/media/cobalt-error";
import {
  buildCobaltFetchHeaders,
  type CobaltResponse,
  isCobaltTunnelUrl,
  isOnCobaltHost,
  normalizeHttpUrl,
  resolveCobaltDownloadUrl,
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
  cobaltBase: string;
};

export type CobaltRequestOptions = {
  base: string;
  apiKey?: string;
  label?: string;
};

export async function requestCobaltDownload(
  url: string,
  format: MediaDownloadFormat,
  platform: MediaPlatform,
  onProgress: MediaDownloadProgressReporter | undefined,
  options: CobaltRequestOptions
): Promise<CobaltResolvedLink> {
  const base = options.base.replace(/\/$/, "");
  const apiKey = options.apiKey?.trim();
  const label = options.label ?? "Cobalt";

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
    body.videoQuality = "360";
  }

  reportProgress(
    onProgress,
    baseProgress(platform, format, {
      status: "resolving",
      progress: 22,
      stageLabel: `${label}: menyiapkan unduhan…`,
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
    throw new Error(`${label}: ${toErrorMessage(err)}`);
  }

  let data: CobaltResponse;
  try {
    data = (await res.json()) as CobaltResponse;
  } catch {
    throw new Error(`${label}: respons bukan JSON (HTTP ${res.status})`);
  }

  if (!res.ok || data.status === "error") {
    throw new Error(
      `${label}: ${formatCobaltApiError(data.error, res.status)}`
    );
  }

  if (data.status === "picker") {
    throw new Error(`${label}: link punya banyak pilihan — coba link lain.`);
  }

  if (data.status === "local-processing") {
    throw new Error(`${label}: butuh remux lokal.`);
  }

  if (!data.url) {
    throw new Error(`${label}: tidak ada URL unduhan.`);
  }

  const downloadUrl = resolveCobaltDownloadUrl(base, data.url);
  if (
    platform === "youtube" &&
    data.status === "redirect" &&
    !isOnCobaltHost(base, downloadUrl)
  ) {
    throw new Error(`${label}: redirect CDN — coba lagi atau ganti sumber.`);
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
    cobaltBase: base,
  };
}

export function isCobaltTunnelLink(
  cobaltBase: string,
  downloadUrl: string,
  status: string
): boolean {
  return status === "tunnel" || isCobaltTunnelUrl(cobaltBase, downloadUrl);
}
