import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

/** Netscape cookies.txt → header `name=value; name2=value2` */
export function normalizeYoutubeCookie(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (
    trimmed.includes("# Netscape HTTP Cookie File") ||
    trimmed.includes("\t.youtube.com\t")
  ) {
    const pairs: string[] = [];
    for (const line of trimmed.split("\n")) {
      if (!line.trim() || line.startsWith("#")) {
        continue;
      }
      const parts = line.split("\t");
      if (parts.length >= 7) {
        const name = parts.at(5)?.trim();
        const value = parts.at(6)?.trim();
        if (name && value) {
          pairs.push(`${name}=${value}`);
        }
      }
    }
    return pairs.length > 0 ? pairs.join("; ") : undefined;
  }

  return trimmed;
}

function loadYoutubeCookieRaw(): string | undefined {
  const fromEnv = process.env.YOUTUBE_COOKIE?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const filePath = process.env.YOUTUBE_COOKIE_FILE?.trim();
  if (!filePath) {
    return undefined;
  }

  try {
    return readFileSync(path.resolve(process.cwd(), filePath), "utf8");
  } catch {
    return undefined;
  }
}

export function resolveYoutubeCookieHeader(): string | undefined {
  return normalizeYoutubeCookie(loadYoutubeCookieRaw());
}
