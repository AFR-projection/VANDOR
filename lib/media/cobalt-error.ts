import { toErrorMessage } from "@/lib/utils/error-message";

type CobaltErrorPayload = {
  code?: string;
  context?: unknown;
};

const COBALT_HINTS: Record<string, string> = {
  "error.api.fetch.fail":
    "Server Cobalt tidak bisa mengambil media dari platform ini (IP diblokir atau layanan down). Di PC lokal: pasang yt-dlp (`winget install yt-dlp`). Di Vercel: perbarui instance Cobalt atau coba link lain.",
  "error.api.invalid_body":
    "Permintaan ke Cobalt tidak valid — periksa COBALT_API_URL (wajib https://) dan versi API instance.",
  "error.api.auth.missing": "Instance Cobalt membutuhkan COBALT_API_KEY.",
  "error.api.auth.invalid": "COBALT_API_KEY tidak valid untuk instance Cobalt.",
  "error.api.rate_limit": "Cobalt rate limit — coba lagi beberapa menit.",
  "error.api.content.tiktok":
    "TikTok menolak IP server Cobalt. VANDOR seharusnya otomatis fallback TikWM untuk /tt — redeploy jika masih gagal.",
  "error.api.content.youtube":
    "YouTube tidak bisa diambil dari Cobalt saat ini — coba yt-dlp atau link lain.",
  "error.api.content.instagram":
    "Instagram tidak bisa diambil dari Cobalt — coba yt-dlp atau link publik lain.",
};

export function formatCobaltApiError(
  error: CobaltErrorPayload | undefined,
  httpStatus: number
): string {
  if (!error) {
    return `Cobalt API gagal (HTTP ${httpStatus})`;
  }

  const code = error.code?.trim() ?? "";
  const ctx = toErrorMessage(error.context);
  const hint = code ? COBALT_HINTS[code] : undefined;

  const parts: string[] = [];
  if (code) {
    parts.push(code);
  }
  if (ctx && ctx !== code) {
    parts.push(ctx);
  }
  if (hint) {
    parts.push(hint);
  }

  if (parts.length > 0) {
    return parts.join(" — ");
  }

  return `Cobalt API gagal (HTTP ${httpStatus})`;
}
