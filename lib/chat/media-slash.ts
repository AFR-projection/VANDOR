import type { MediaDownloadFormat, MediaPlatform } from "@/lib/media/types";

export type MediaSlashCommand = {
  command: "tt" | "ytv" | "yts" | "ig";
  url: string;
  format: MediaDownloadFormat;
  platform: MediaPlatform;
};

const MEDIA_SLASH_RE = /^\/?(tt|ytv|yts|ig)\s+(\S+)/i;

/** `/tt` tanpa URL — Enter menampilkan petunjuk, bukan mengirim kosong. */
export function isBareMediaSlash(text: string): boolean {
  return /^\/?(tt|ytv|yts|ig)\s*$/i.test(text.trim());
}

export function parseMediaSlash(text: string): MediaSlashCommand | null {
  const trimmed = text.trim();
  const match = trimmed.match(MEDIA_SLASH_RE);
  if (!match) {
    return null;
  }

  const command = match[1].toLowerCase() as MediaSlashCommand["command"];
  const url = match[2].replace(/[<>]/g, "");

  let format: MediaDownloadFormat = "video";
  let platform: MediaPlatform = "youtube";

  switch (command) {
    case "tt":
      platform = "tiktok";
      format = "video";
      break;
    case "ig":
      platform = "instagram";
      format = "video";
      break;
    case "yts":
      platform = "youtube";
      format = "audio";
      break;
    case "ytv":
      platform = "youtube";
      format = "video";
      break;
    default:
      return null;
  }

  if (!isUrlForPlatform(url, platform)) {
    return null;
  }

  return { command, url, format, platform };
}

export function isUrlForPlatform(
  url: string,
  platform: MediaPlatform
): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (platform === "tiktok") {
      return (
        host.includes("tiktok.com") ||
        host.includes("vm.tiktok.com") ||
        host === "vt.tiktok.com"
      );
    }
    if (platform === "instagram") {
      return host.includes("instagram.com") || host === "instagr.am";
    }
    return (
      host.includes("youtube.com") ||
      host.includes("youtu.be") ||
      host.includes("youtube-nocookie.com")
    );
  } catch {
    return false;
  }
}

export const MEDIA_SLASH_HINT = `
## Unduh media (/tt, /ytv, /yts, /ig)
- **/tt <url>** — video TikTok (MP4)
- **/ytv <url>** — video YouTube (MP4)
- **/yts <url>** — audio YouTube (MP3)
- **/ig <url>** — video Instagram (MP4)
- Panggil \`downloadMedia\` dengan URL lengkap jika user minta unduh tanpa slash. Jangan webSearch untuk unduhan.
`.trim();
