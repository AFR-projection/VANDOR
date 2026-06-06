import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isUrlForPlatform } from "@/lib/chat/media-slash";
import { formatCobaltApiError } from "@/lib/media/cobalt-error";
import {
  baseProgress,
  reportProgress,
  startResolvingPulse,
  startSimulatedDownloadProgress,
  startUploadProgressSimulation,
} from "@/lib/media/progress";
import { readResponseWithProgress } from "@/lib/media/stream-fetch";
import { downloadWithTikwm } from "@/lib/media/tiktok-tikwm";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
  MediaDownloadResult,
  MediaPlatform,
} from "@/lib/media/types";
import { downloadYoutubeViaFallback } from "@/lib/media/youtube-fallback";
import { putFile, StorageNotConfiguredError } from "@/lib/storage/blob";
import { toErrorMessage } from "@/lib/utils/error-message";

const MAX_BYTES = 80 * 1024 * 1024;
const MIN_BYTES = 1024;
const YTDLP_TIMEOUT_MS = 120_000;
const FETCH_TIMEOUT_MS = 120_000;

/** Node fetch butuh skema lengkap — browser tidak. */
function normalizeHttpUrl(raw: string, label: string): string {
  let candidate = raw.trim();
  if (!candidate) {
    throw new Error(`${label} kosong.`);
  }
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate.replace(/^\/+/, "")}`;
  }
  try {
    return new URL(candidate).href;
  } catch {
    throw new Error(
      `${label} tidak valid ("${raw}"). Contoh benar: https://cobalt-api-production-2f6c.up.railway.app`
    );
  }
}

function resolveCobaltApiBase(): string {
  const raw = process.env.COBALT_API_URL?.trim();
  if (!raw) {
    return "https://api.cobalt.tools";
  }
  return normalizeHttpUrl(raw, "COBALT_API_URL").replace(/\/$/, "");
}

type CobaltResponse = {
  status: string;
  url?: string;
  filename?: string;
  error?: { code?: string; context?: unknown };
  headers?: Record<string, string>;
};

/** Cobalt tunnel URLs are sometimes relative (`/tunnel?…`) — must join with API base. */
export function resolveCobaltDownloadUrl(
  cobaltBase: string,
  url: string
): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const base = cobaltBase.replace(/\/$/, "");
  if (trimmed.startsWith("/")) {
    return `${base}${trimmed}`;
  }
  return new URL(trimmed, `${base}/`).href;
}

function isOnCobaltHost(cobaltBase: string, downloadUrl: string): boolean {
  try {
    return new URL(downloadUrl).host === new URL(cobaltBase).host;
  } catch {
    return false;
  }
}

function isCobaltTunnelUrl(cobaltBase: string, downloadUrl: string): boolean {
  try {
    const baseHost = new URL(cobaltBase).host;
    const target = new URL(downloadUrl);
    return target.host === baseHost && target.pathname.includes("/tunnel");
  } catch {
    return downloadUrl.includes("/tunnel");
  }
}

function buildCobaltFetchHeaders(input: {
  status: string;
  downloadUrl: string;
  cobaltBase: string;
  responseHeaders?: Record<string, string>;
  apiKey?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    ...(input.responseHeaders ?? {}),
    Accept: "*/*",
  };
  if (
    input.apiKey &&
    (input.status === "tunnel" ||
      isCobaltTunnelUrl(input.cobaltBase, input.downloadUrl) ||
      isOnCobaltHost(input.cobaltBase, input.downloadUrl))
  ) {
    headers.Authorization = `Api-Key ${input.apiKey}`;
  }
  return headers;
}

function assertNonEmptyDownload(buffer: Buffer, backend: string): void {
  if (buffer.length >= MIN_BYTES) {
    return;
  }
  throw new Error(
    `File unduhan kosong (${buffer.length} byte) via ${backend}. ` +
      "Di Vercel: pastikan COBALT_API_URL benar, COBALT_API_KEY jika instance pakai auth, " +
      "dan API_URL di instance Cobalt mengarah ke domain publik Railway/VPS (tunnel butuh ini)."
  );
}

function hasCobaltBackend(): boolean {
  return Boolean(
    process.env.COBALT_API_URL?.trim() ||
      process.env.COBALT_ALLOW_PUBLIC === "1"
  );
}

function shouldTryYtDlpFirst(): boolean {
  if (process.env.VERCEL) {
    return false;
  }
  if (process.env.YT_DLP_PATH?.trim()) {
    return true;
  }
  if (hasCobaltBackend() && process.env.VANDOR_PREFER_YTDLP !== "1") {
    return false;
  }
  return true;
}

export type DownloadSocialMediaInput = {
  url: string;
  format: MediaDownloadFormat;
  platform: MediaPlatform;
};

function extForFormat(format: MediaDownloadFormat): string {
  return format === "audio" ? "mp3" : "mp4";
}

function contentTypeForFormat(format: MediaDownloadFormat): string {
  return format === "audio" ? "audio/mpeg" : "video/mp4";
}

function sanitizeFilename(name: string, format: MediaDownloadFormat): string {
  const base = name
    .replace(/[^\w\s.-]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
  if (/\.(mp3|m4a|mp4|webm|mkv)$/i.test(base)) {
    return base;
  }
  const ext = extForFormat(format);
  return `${base || "download"}.${ext}`;
}

function contentTypeForFilename(
  filename: string,
  format: MediaDownloadFormat
): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".m4a")) {
    return "audio/mp4";
  }
  if (lower.endsWith(".webm")) {
    return format === "audio" ? "audio/webm" : "video/webm";
  }
  return contentTypeForFormat(format);
}

async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  format: MediaDownloadFormat
): Promise<{ url: string; sizeBytes: number; contentType: string }> {
  if (buffer.length > MAX_BYTES) {
    throw new Error(
      `File terlalu besar (${Math.round(buffer.length / 1024 / 1024)}MB). Maks ${MAX_BYTES / 1024 / 1024}MB.`
    );
  }
  const contentType = contentTypeForFilename(filename, format);
  const stored = await putFile(`media/${filename}`, buffer, {
    contentType,
    addRandomSuffix: true,
  });
  return {
    url: stored.url,
    sizeBytes: buffer.length,
    contentType,
  };
}

async function fetchRemoteFile(
  url: string,
  headers: Record<string, string> | undefined,
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat
): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const fetchUrl = normalizeHttpUrl(url, "URL unduhan media");
  try {
    const res = await fetch(fetchUrl, {
      signal: controller.signal,
      headers: headers ?? {},
      redirect: "follow",
    });
    const buf = await readResponseWithProgress(
      res,
      onProgress,
      platform,
      format,
      { from: 24, to: 76 }
    );
    if (buf.length > MAX_BYTES) {
      throw new Error(
        `File terlalu besar (${Math.round(buf.length / 1024 / 1024)}MB).`
      );
    }
    assertNonEmptyDownload(buf, "fetch");
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWithYtDlp(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform
): Promise<{ buffer: Buffer; title: string } | null> {
  const bin = process.env.YT_DLP_PATH?.trim() || "yt-dlp";
  const dir = await mkdtemp(path.join(tmpdir(), "vandor-ytdlp-"));
  const outTemplate = path.join(dir, "%(title).80B.%(ext)s");

  const args =
    format === "audio"
      ? [
          "-x",
          "--audio-format",
          "mp3",
          "--newline",
          "--no-playlist",
          "--no-warnings",
          "-o",
          outTemplate,
          url,
        ]
      : [
          "-f",
          "bv*+ba/b[ext=mp4]/b",
          "--merge-output-format",
          "mp4",
          "--newline",
          "--no-playlist",
          "--no-warnings",
          "-o",
          outTemplate,
          url,
        ];

  const stopSim = startSimulatedDownloadProgress(
    onProgress,
    platform,
    format,
    20,
    55
  );

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error("yt-dlp timeout"));
      }, YTDLP_TIMEOUT_MS);

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = stderr.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
        if (match) {
          const pct = Number.parseFloat(match[1]);
          reportProgress(
            onProgress,
            baseProgress(platform, format, {
              status: "downloading",
              progress: Math.min(72, 18 + Math.round(pct * 0.54)),
              stageLabel: `yt-dlp ${pct.toFixed(0)}%`,
            })
          );
        }
      });

      proc.on("error", (err) => {
        clearTimeout(killTimer);
        reject(err);
      });
      proc.on("close", (code) => {
        clearTimeout(killTimer);
        if (code === 0) resolve();
        else reject(new Error(stderr.slice(-400) || `yt-dlp exit ${code}`));
      });
    });

    const files = await readdir(dir);
    const mediaFile = files.find((f) =>
      format === "audio"
        ? f.endsWith(".mp3") || f.endsWith(".m4a")
        : /\.(mp4|webm|mkv)$/i.test(f)
    );
    if (!mediaFile) {
      return null;
    }
    const fullPath = path.join(dir, mediaFile);
    const buffer = await readFile(fullPath);
    const title = path.basename(mediaFile, path.extname(mediaFile));
    return { buffer, title };
  } catch {
    return null;
  } finally {
    stopSim();
    await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

async function downloadWithCobalt(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform
): Promise<{ buffer: Buffer; title: string; filename?: string }> {
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
    // Cloud/serverless IPs are blocked by YouTube CDN on direct redirect — force tunnel.
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
        `Tidak bisa menghubungi Cobalt — periksa COBALT_API_URL di Vercel (wajib pakai https://). Nilai saat ini: ${process.env.COBALT_API_URL?.trim() || "(kosong)"}`
      );
    }
    throw err;
  }

  let data: CobaltResponse;
  try {
    data = (await res.json()) as CobaltResponse;
  } catch {
    throw new Error(
      `Cobalt mengembalikan respons bukan JSON (HTTP ${res.status}). Pastikan COBALT_API_URL mengarah ke instance Cobalt API, bukan halaman lain.`
    );
  }

  if (!res.ok || data.status === "error") {
    throw new Error(formatCobaltApiError(data.error, res.status));
  }

  if (data.status === "picker") {
    throw new Error(
      "Link punya beberapa pilihan media — buka di browser atau coba link yang lebih spesifik."
    );
  }

  if (data.status === "local-processing") {
    throw new Error(
      "Cobalt membutuhkan remux lokal (ffmpeg) yang tidak tersedia di server VANDOR. " +
        "Gunakan instance Cobalt yang otomatis remux, atau yt-dlp di VPS/lokal."
    );
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
      "Cobalt mengembalikan redirect CDN YouTube — tidak bisa di-fetch dari server cloud."
    );
  }

  const fetchHeaders = buildCobaltFetchHeaders({
    status: data.status,
    downloadUrl,
    cobaltBase: base,
    responseHeaders: data.headers,
    apiKey,
  });

  const buffer = await fetchRemoteFile(
    downloadUrl,
    fetchHeaders,
    onProgress,
    platform,
    format
  );
  const title = data.filename?.replace(/\.[^.]+$/, "") ?? "media";
  return { buffer, title, filename: data.filename };
}

type YoutubeBackend = "cobalt" | "piped" | "invidious";

async function downloadYoutube(
  url: string,
  format: MediaDownloadFormat,
  onProgress: MediaDownloadProgressReporter | undefined
): Promise<{
  buffer: Buffer;
  title: string;
  filename?: string;
  backend: YoutubeBackend;
}> {
  if (process.env.VERCEL) {
    try {
      return await downloadYoutubeViaFallback(url, format, onProgress);
    } catch (fallbackErr) {
      if (!hasCobaltBackend()) {
        throw fallbackErr;
      }
      try {
        const cobalt = await downloadWithCobalt(
          url,
          format,
          onProgress,
          "youtube"
        );
        return { ...cobalt, backend: "cobalt" };
      } catch (cobaltErr) {
        throw new Error(
          `Fallback: ${toErrorMessage(fallbackErr)}. Cobalt: ${toErrorMessage(cobaltErr)}`
        );
      }
    }
  }

  let cobaltErr: unknown;

  if (hasCobaltBackend()) {
    try {
      const cobalt = await downloadWithCobalt(
        url,
        format,
        onProgress,
        "youtube"
      );
      return { ...cobalt, backend: "cobalt" };
    } catch (err) {
      cobaltErr = err;
    }
  }

  try {
    const fallback = await downloadYoutubeViaFallback(url, format, onProgress);
    return fallback;
  } catch (fallbackErr) {
    const cobaltMsg = cobaltErr ? toErrorMessage(cobaltErr) : null;
    const fallbackMsg = toErrorMessage(fallbackErr);
    throw new Error(
      cobaltMsg ? `Cobalt: ${cobaltMsg}. Fallback: ${fallbackMsg}` : fallbackMsg
    );
  }
}

export async function downloadSocialMedia(
  input: DownloadSocialMediaInput,
  onProgress?: MediaDownloadProgressReporter
): Promise<MediaDownloadResult> {
  const { url, format, platform } = input;

  reportProgress(
    onProgress,
    baseProgress(platform, format, {
      status: "validating",
      progress: 6,
      stageLabel: "Memvalidasi link…",
    })
  );

  if (!isUrlForPlatform(url, platform)) {
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "error",
        progress: 0,
        stageLabel: "Link tidak valid",
        error: `URL tidak cocok untuk ${platform}`,
      })
    );
    return {
      ok: false,
      platform,
      format,
      error: `URL tidak cocok untuk platform ${platform}.`,
    };
  }

  let stopResolvePulse: (() => void) | null = null;

  try {
    let buffer: Buffer | null = null;
    let title = "media";
    let backend: MediaDownloadResult["backend"] = "yt-dlp";
    let suggestedName: string | undefined;

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "resolving",
        progress: 14,
        stageLabel: "Mengambil media dari sumber…",
      })
    );

    stopResolvePulse = startResolvingPulse(
      onProgress,
      platform,
      format,
      15,
      26
    );

    const ytdlp = shouldTryYtDlpFirst()
      ? await downloadWithYtDlp(url, format, onProgress, platform)
      : null;
    if (ytdlp && ytdlp.buffer.length > 0) {
      buffer = ytdlp.buffer;
      title = ytdlp.title;
      reportProgress(
        onProgress,
        baseProgress(platform, format, {
          status: "downloading",
          progress: 74,
          stageLabel: "Unduhan lokal selesai",
          bytesReceived: buffer.length,
        })
      );
    } else if (
      platform === "tiktok" &&
      process.env.VANDOR_DISABLE_TIKWM !== "1"
    ) {
      try {
        const tikwm = await downloadWithTikwm(url, format, onProgress);
        buffer = tikwm.buffer;
        title = tikwm.title;
        suggestedName = tikwm.filename;
        backend = "tikwm";
      } catch (tikwmErr) {
        const cobaltConfigured =
          process.env.COBALT_API_URL?.trim() ||
          process.env.COBALT_ALLOW_PUBLIC === "1";
        if (!cobaltConfigured) {
          const msg = toErrorMessage(tikwmErr);
          reportProgress(
            onProgress,
            baseProgress(platform, format, {
              status: "error",
              progress: 0,
              stageLabel: "Gagal mengunduh",
              error: msg,
            })
          );
          stopResolvePulse?.();
          stopResolvePulse = null;
          return { ok: false, platform, format, error: msg };
        }
        backend = "cobalt";
        try {
          const cobalt = await downloadWithCobalt(
            url,
            format,
            onProgress,
            platform
          );
          buffer = cobalt.buffer;
          title = cobalt.title;
          suggestedName = cobalt.filename;
        } catch (cobaltErr) {
          const msg = `${toErrorMessage(tikwmErr)} (Cobalt: ${toErrorMessage(cobaltErr)})`;
          reportProgress(
            onProgress,
            baseProgress(platform, format, {
              status: "error",
              progress: 0,
              stageLabel: "Gagal mengunduh",
              error: msg,
            })
          );
          stopResolvePulse?.();
          stopResolvePulse = null;
          return { ok: false, platform, format, error: msg };
        }
      }
    } else if (platform === "youtube") {
      try {
        const yt = await downloadYoutube(url, format, onProgress);
        buffer = yt.buffer;
        title = yt.title;
        suggestedName = yt.filename;
        backend = yt.backend;
      } catch (ytErr) {
        const msg = toErrorMessage(ytErr);
        reportProgress(
          onProgress,
          baseProgress(platform, format, {
            status: "error",
            progress: 0,
            stageLabel: "Gagal mengunduh",
            error: msg,
          })
        );
        stopResolvePulse?.();
        stopResolvePulse = null;
        return { ok: false, platform, format, error: msg };
      }
    } else if (
      process.env.COBALT_API_URL?.trim() ||
      process.env.COBALT_ALLOW_PUBLIC === "1"
    ) {
      backend = "cobalt";
      try {
        const cobalt = await downloadWithCobalt(
          url,
          format,
          onProgress,
          platform
        );
        buffer = cobalt.buffer;
        title = cobalt.title;
        suggestedName = cobalt.filename;
      } catch (cobaltErr) {
        const hint = process.env.COBALT_API_URL?.trim()
          ? ""
          : " Pasang yt-dlp di PATH, atau set COBALT_API_URL (instance sendiri) di env.";
        const msg = toErrorMessage(cobaltErr);
        reportProgress(
          onProgress,
          baseProgress(platform, format, {
            status: "error",
            progress: 0,
            stageLabel: "Gagal mengunduh",
            error: `${msg}${hint}`,
          })
        );
        stopResolvePulse?.();
        stopResolvePulse = null;
        return {
          ok: false,
          platform,
          format,
          error: `${msg}${hint}`,
        };
      }
    } else {
      const errMsg =
        "Unduhan belum dikonfigurasi di server. Pasang yt-dlp di PATH (dev/VPS) atau set COBALT_API_URL (+ opsional COBALT_API_KEY) untuk Vercel.";
      reportProgress(
        onProgress,
        baseProgress(platform, format, {
          status: "error",
          progress: 0,
          stageLabel: "Server belum dikonfigurasi",
          error: errMsg,
        })
      );
      stopResolvePulse?.();
      stopResolvePulse = null;
      return {
        ok: false,
        platform,
        format,
        error: errMsg,
      };
    }

    stopResolvePulse?.();
    stopResolvePulse = null;

    if (!buffer || buffer.length < MIN_BYTES) {
      throw new Error(
        `File unduhan kosong (${buffer?.length ?? 0} byte). ` +
          "Periksa COBALT_API_URL, COBALT_API_KEY, dan API_URL di instance Cobalt."
      );
    }

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "uploading",
        progress: 80,
        stageLabel: "Mengunggah ke penyimpanan cloud…",
        bytesReceived: buffer.length,
        bytesTotal: buffer.length,
      })
    );

    const filename = sanitizeFilename(suggestedName ?? title, format);
    const stopUploadSim = startUploadProgressSimulation(
      onProgress,
      platform,
      format,
      buffer.length
    );
    let uploaded: Awaited<ReturnType<typeof uploadBuffer>>;
    try {
      uploaded = await uploadBuffer(buffer, filename, format);
    } finally {
      stopUploadSim();
    }

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "uploading",
        progress: 98,
        stageLabel: "Menyelesaikan…",
        bytesReceived: uploaded.sizeBytes,
        bytesTotal: uploaded.sizeBytes,
      })
    );

    const result: MediaDownloadResult = {
      ok: true,
      url: uploaded.url,
      filename,
      title,
      platform,
      format,
      sizeBytes: uploaded.sizeBytes,
      contentType: uploaded.contentType,
      backend,
    };

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "complete",
        progress: 100,
        stageLabel: "Selesai — file siap diunduh",
        downloadUrl: uploaded.url,
        title,
        bytesReceived: uploaded.sizeBytes,
      })
    );

    return result;
  } catch (err) {
    stopResolvePulse?.();
    if (err instanceof StorageNotConfiguredError) {
      reportProgress(
        onProgress,
        baseProgress(platform, format, {
          status: "error",
          progress: 0,
          stageLabel: "Storage belum dikonfigurasi",
          error: err.message,
        })
      );
      return {
        ok: false,
        platform,
        format,
        error: err.message,
      };
    }
    const message = toErrorMessage(err);
    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "error",
        progress: 0,
        stageLabel: "Terjadi kesalahan",
        error: message,
      })
    );
    return { ok: false, platform, format, error: message };
  }
}

function formatDownloadSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (sizeBytes >= 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} B`;
}

function mediaKindLabel(result: MediaDownloadResult): string {
  if (result.format === "video") {
    return "MP4";
  }
  const name = result.filename?.toLowerCase() ?? "";
  if (name.endsWith(".m4a")) {
    return "M4A";
  }
  return "MP3";
}

export function formatMediaDownloadReply(result: MediaDownloadResult): string {
  if (!result.ok) {
    const detail = toErrorMessage(result.error);
    return `Gagal mengunduh media (${result.platform}): ${detail}`;
  }
  const sizeMb =
    result.sizeBytes == null
      ? ""
      : ` (${formatDownloadSize(result.sizeBytes)})`;
  const kind = mediaKindLabel(result);
  return [
    `Unduhan ${result.platform} (${kind}) siap${sizeMb}.`,
    result.title ? `**${result.title}**` : "",
    `[Unduh file](${result.url})`,
    result.backend ? `_via ${result.backend}_` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
