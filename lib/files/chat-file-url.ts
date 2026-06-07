import { getAppUrl } from "@/lib/app-url";

/** Chat upload paths live under `vandor/` on R2 (plain, not encrypted vault). */

const CHAT_PREFIX = "vandor/";

export function isChatFileKey(key: string): boolean {
  return key.startsWith(CHAT_PREFIX) && !key.includes("..");
}

/** R2 S3 endpoint — private; browsers cannot load these directly. */
export function isPrivateR2Url(url: string): boolean {
  return /\.r2\.cloudflarestorage\.com\//i.test(url);
}

export function isChatFileServeUrl(url: string): boolean {
  return url.includes("/api/files/raw");
}

/** Extract `vandor/...` key from a private R2 URL or serve URL. */
export function r2ChatKeyFromUrl(url: string): string | null {
  try {
    const parsed = url.startsWith("http")
      ? new URL(url)
      : new URL(url, "http://localhost");

    if (parsed.pathname.includes("/api/files/raw")) {
      const key = parsed.searchParams.get("key")?.trim();
      return key && isChatFileKey(key) ? key : null;
    }

    const idx = parsed.pathname.indexOf(`/${CHAT_PREFIX}`);
    if (idx >= 0) {
      const key = parsed.pathname.slice(idx + 1);
      return isChatFileKey(key) ? key : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function chatFileServePath(pathname: string): string {
  const key = pathname.startsWith(CHAT_PREFIX)
    ? pathname
    : `${CHAT_PREFIX}${pathname.replace(/^\/+/, "")}`;
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}/api/files/raw?key=${encodeURIComponent(key)}`;
}

/** Absolute URL for API payloads & persisted messages (passes Zod `.url()`). */
export function chatFileServeUrl(pathname: string): string {
  return `${getAppUrl()}${chatFileServePath(pathname)}`;
}

/** Rewrite broken private R2 URLs to the authenticated app proxy (client + server). */
export function resolveChatFileDisplayUrl(url: string): string {
  if (isChatFileServeUrl(url)) {
    if (url.startsWith("http")) {
      return url;
    }
    if (typeof window !== "undefined") {
      return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
    }
    return `${getAppUrl()}${url}`;
  }
  const key = r2ChatKeyFromUrl(url);
  if (key) {
    return chatFileServeUrl(key);
  }
  return url;
}
