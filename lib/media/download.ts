import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { isUrlForPlatform } from "@/lib/chat/media-slash";
import { formatCobaltApiError } from "@/lib/media/cobalt-error";
import {
  baseProgress,
  formatBytes,
  reportProgress,
  startSimulatedDownloadProgress,
} from "@/lib/media/progress";
import { downloadWithTikwm } from "@/lib/media/tiktok-tikwm";
import type {
  MediaDownloadFormat,
  MediaDownloadProgressReporter,
  MediaDownloadResult,
  MediaPlatform,
} from "@/lib/media/types";
import { putFile, StorageNotConfiguredError } from "@/lib/storage/blob";
import { toErrorMessage } from "@/lib/utils/error-message";

const MAX_BYTES = 80 * 1024 * 1024;
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
  const ext = extForFormat(format);
  return base.endsWith(`.${ext}`) ? base : `${base || "download"}.${ext}`;
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
  const stored = await putFile(`media/${filename}`, buffer, {
    contentType: contentTypeForFormat(format),
    addRandomSuffix: true,
  });
  return {
    url: stored.url,
    sizeBytes: buffer.length,
    contentType: contentTypeForFormat(format),
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
    if (!res.ok) {
      throw new Error(`Unduhan gagal (HTTP ${res.status})`);
    }

    const total = Number(res.headers.get("content-length")) || 0;
    const body = res.body;

    if (!body) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) {
        throw new Error(
          `File terlalu besar (${Math.round(buf.length / 1024 / 1024)}MB).`
        );
      }
      return buf;
    }

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.length;
        if (total > 0) {
          const ratio = Math.min(1, received / total);
          const progress = 20 + Math.round(ratio * 52);
          reportProgress(
            onProgress,
            baseProgress(platform, format, {
              status: "downloading",
              progress,
              stageLabel: `Mengunduh… ${formatBytes(received)} / ${formatBytes(total)}`,
              bytesReceived: received,
              bytesTotal: total,
            })
          );
        }
      }
    }

    const buf = Buffer.concat(chunks);
    if (buf.length > MAX_BYTES) {
      throw new Error(
        `File terlalu besar (${Math.round(buf.length / 1024 / 1024)}MB).`
      );
    }
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
  };
  if (platform === "tiktok") {
    body.alwaysProxy = true;
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

  if (!data.url) {
    throw new Error("Cobalt tidak mengembalikan URL unduhan.");
  }

  const buffer = await fetchRemoteFile(
    data.url,
    data.headers,
    onProgress,
    platform,
    format
  );
  const title = data.filename?.replace(/\.[^.]+$/, "") ?? "media";
  return { buffer, title, filename: data.filename };
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

  try {
    let buffer: Buffer | null = null;
    let title = "media";
    let backend: "yt-dlp" | "cobalt" | "tikwm" = "yt-dlp";
    let suggestedName: string | undefined;

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "resolving",
        progress: 14,
        stageLabel: "Mengambil media dari sumber…",
      })
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
          return { ok: false, platform, format, error: msg };
        }
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
      return {
        ok: false,
        platform,
        format,
        error: errMsg,
      };
    }

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "uploading",
        progress: 82,
        stageLabel: "Mengunggah ke penyimpanan cloud…",
        bytesReceived: buffer.length,
      })
    );

    const filename = sanitizeFilename(suggestedName ?? title, format);
    const uploaded = await uploadBuffer(buffer, filename, format);

    reportProgress(
      onProgress,
      baseProgress(platform, format, {
        status: "uploading",
        progress: 96,
        stageLabel: "Menyelesaikan…",
        bytesReceived: uploaded.sizeBytes,
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

export function formatMediaDownloadReply(result: MediaDownloadResult): string {
  if (!result.ok) {
    const detail = toErrorMessage(result.error);
    return `Gagal mengunduh media (${result.platform}): ${detail}`;
  }
  const sizeMb =
    result.sizeBytes == null
      ? ""
      : ` (${(result.sizeBytes / 1024 / 1024).toFixed(1)} MB)`;
  const kind = result.format === "audio" ? "MP3" : "MP4";
  return [
    `Unduhan ${result.platform} (${kind}) siap${sizeMb}.`,
    result.title ? `**${result.title}**` : "",
    `[Unduh file](${result.url})`,
    result.backend ? `_via ${result.backend}_` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
