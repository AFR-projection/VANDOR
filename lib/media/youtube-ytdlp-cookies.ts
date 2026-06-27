import "server-only";

import { accessSync, constants } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeYoutubeCookie,
  resolveYoutubeCookieHeader,
} from "@/lib/media/youtube-cookie";

export const DEFAULT_YOUTUBE_COOKIE_FILE = "cookies/youtube.txt";

function isNetscapeCookieFile(raw: string): boolean {
  return (
    raw.includes("# Netscape HTTP Cookie File") ||
    raw.includes("\t.youtube.com\t")
  );
}

function resolveConfiguredCookiePath(): string {
  const configured =
    process.env.YOUTUBE_COOKIE_FILE?.trim() || DEFAULT_YOUTUBE_COOKIE_FILE;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

/** Path ke cookies.txt Netscape untuk flag `--cookies` yt-dlp. */
export async function resolveYoutubeCookiesFileForYtdlp(): Promise<
  string | undefined
> {
  const resolved = resolveConfiguredCookiePath();

  try {
    accessSync(resolved, constants.R_OK);
    return resolved;
  } catch {
    // fall through — maybe inline env
  }

  const fromEnv = process.env.YOUTUBE_COOKIE?.trim();
  if (fromEnv && isNetscapeCookieFile(fromEnv)) {
    const dir = path.join(process.cwd(), "cookies");
    await mkdir(dir, { recursive: true });
    const dest = path.join(dir, ".youtube-cookies-env.txt");
    await writeFile(dest, fromEnv, { mode: 0o600 });
    return dest;
  }

  return undefined;
}

/** Header Cookie untuk `--add-header` jika bukan format Netscape. */
export function resolveYoutubeCookieHeaderForYtdlp(): string | undefined {
  const fromEnv = process.env.YOUTUBE_COOKIE?.trim();
  if (fromEnv && !isNetscapeCookieFile(fromEnv)) {
    return normalizeYoutubeCookie(fromEnv);
  }
  return resolveYoutubeCookieHeader();
}

export function hasYoutubeCookiesConfigured(): boolean {
  if (process.env.YOUTUBE_COOKIE?.trim()) {
    return true;
  }
  try {
    accessSync(resolveConfiguredCookiePath(), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function youtubePoTokenExtractorArg(): string | undefined {
  const token = process.env.YOUTUBE_PO_TOKEN?.trim();
  if (!token) {
    return undefined;
  }
  return `youtube:po_token=web+${token}`;
}

export function isYoutubeBotBlockError(message: string): boolean {
  return /sign in to confirm|not a bot|bot detection|cookies.*youtube/i.test(
    message
  );
}

export const YOUTUBE_VPS_COOKIE_HINT =
  "YouTube memblokir IP VPS. Export cookies (login google.com/youtube.com) ke cookies/youtube.txt — panduan: deploy/hostinger/YOUTUBE-COOKIES.md";
