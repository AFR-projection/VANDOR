import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isUrlForPlatform } from "@/lib/chat/media-slash";
import {
  hasCobaltBackend,
  normalizeHttpUrl,
  resolveCobaltApiBase,
} from "@/lib/media/cobalt-shared";
import {
  isCobaltTunnelLink,
  requestCobaltDownload,
  type CobaltRequestOptions,
} from "@/lib/media/cobalt-resolve";
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
import { downloadWithInnertube } from "@/lib/media/youtube-innertube";
import {
  downloadWithYtdlpApi,
  hasYtdlpApiBackend,
} from "@/lib/media/youtube-ytdlp-api";
import { putFile, StorageNotConfiguredError } from "@/lib/storage/blob";
import { toErrorMessage } from "@/lib/utils/error-message";

const MAX_BYTES = 80 * 1024 * 1024;
const MIN_BYTES = 1024;
const YTDLP_TIMEOUT_MS = 120_000;
const FETCH_TIMEOUT_MS = 120_000;

const PUBLIC_COBALT_BASE = "https://api.cobalt.tools";

function listYoutubeCobaltSources(): CobaltRequestOptions[] {
  const sources: CobaltRequestOptions[] = [];
  const userBase = process.env.COBALT_API_URL?.trim();
  if (userBase) {
    sources.push({
      base: normalizeHttpUrl(userBase, "COBALT_API_URL").replace(/\/$/, ""),
      apiKey: process.env.COBALT_API_KEY?.trim(),
      label: "Cobalt Railway",
    });
  }
  sources.push({
    base: PUBLIC_COBALT_BASE,
    label: "Cobalt publik",
  });
  return sources;
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

async function fetchCobaltTunnelFile(
  url: string,
  headers: Record<string, string>,
  onProgress: MediaDownloadProgressReporter | undefined,
  platform: MediaPlatform,
  format: MediaDownloadFormat
): Promise<Buffer> {
  const fetchUrl = normalizeHttpUrl(url, "URL unduhan media");
  const maxAttempts = 24;
  const delayMs = 2500;
  let lastError = "Cobalt tunnel kosong";
  let emptyReads = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(fetchUrl, {
        signal: controller.signal,
        headers,
        redirect: "follow",
      });

      if (res.status === 404) {
        throw new Error("Cobalt remux gagal (tunnel kedaluwarsa).");
      }

      const buf = await readResponseWithProgress(
        res,
        onProgress,
        platform,
        format,
        { from: 24, to: 76 },
        "Cobalt"
      );

      if (buf.length >= MIN_BYTES) {
        return buf;
      }

      emptyReads += 1;
      lastError = `Cobalt tunnel belum siap (${buf.length} byte)`;
      if (emptyReads >= 12) {
        throw new Error(
          "Cobalt remux gagal untuk video ini — yt-dlp cadangan akan dicoba."
        );
      }
    } catch (err) {
      lastError = toErrorMessage(err);
      if (/404|kedaluwarsa|yt-dlp cadangan/i.test(lastError)) {
        throw new Error(lastError);
      }
    } finally {
      clearTimeout(timer);
    }

    if (attempt < maxAttempts - 1) {
      reportProgress(
        onProgress,
        baseProgress(platform, format, {
          status: "downloading",
          progress: 28 + Math.min(45, attempt * 2),
          stageLabel: `Cobalt: menunggu remux… (${attempt + 1}/${maxAttempts})`,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(lastError);
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
  platform: MediaPlatform,
  source?: CobaltRequestOptions
): Promise<{ buffer: Buffer; title: string; filename?: string }> {
  const cobaltSource: CobaltRequestOptions = source ?? {
    base: resolveCobaltApiBase(),
    apiKey: process.env.COBALT_API_KEY?.trim(),
    label: "Cobalt",
  };

  const resolved = await requestCobaltDownload(
    url,
    format,
    platform,
    onProgress,
    cobaltSource
  );

  const buffer = isCobaltTunnelLink(
    resolved.cobaltBase,
    resolved.downloadUrl,
    resolved.status
  )
    ? await fetchCobaltTunnelFile(
        resolved.downloadUrl,
        resolved.fetchHeaders,
        onProgress,
        platform,
        format
      )
    : await fetchRemoteFile(
        resolved.downloadUrl,
        resolved.fetchHeaders,
        onProgress,
        platform,
        format
      );

  return {
    buffer,
    title: resolved.title,
    filename: resolved.filename,
  };
}

type YoutubeBackend = "ytdlp" | "innertube" | "cobalt" | "piped" | "invidious";

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
  const errors: string[] = [];

  if (!process.env.VERCEL) {
    try {
      const innertube = await downloadWithInnertube(url, format, onProgress);
      return { ...innertube, backend: "innertube" };
    } catch (err) {
      errors.push(`InnerTube: ${toErrorMessage(err)}`);
    }
  }

  for (const source of listYoutubeCobaltSources()) {
    try {
      const cobalt = await downloadWithCobalt(
        url,
        format,
        onProgress,
        "youtube",
        source
      );
      return { ...cobalt, backend: "cobalt" };
    } catch (err) {
      errors.push(toErrorMessage(err));
    }
  }

  if (hasYtdlpApiBackend()) {
    try {
      const ytdlp = await downloadWithYtdlpApi(url, format, onProgress);
      return { ...ytdlp, backend: "ytdlp" };
    } catch (err) {
      errors.push(`yt-dlp: ${toErrorMessage(err)}`);
    }
  }

  try {
    return await downloadYoutubeViaFallback(url, format, onProgress);
  } catch (err) {
    errors.push(`Fallback: ${toErrorMessage(err)}`);
  }

  throw new Error(
    `${errors.join(". ")}. Coba lagi nanti atau gunakan /ytv dari PC (npm run dev).`
  );
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
      delivery: "blob",
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

  if (result.delivery === "direct" && result.url) {
    const kind = mediaKindLabel(result);
    return [
      `Link unduhan ${result.platform} (${kind}) siap.`,
      result.title ? `**${result.title}**` : "",
      `[Unduh di sini](${result.url})`,
      "_Buka link di browser — tunggu sebentar jika Cobalt masih remux._",
      result.backend ? `_via ${result.backend}_` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
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
