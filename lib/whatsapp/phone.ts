import "server-only";

/** Hanya digit — nomor internasional (bukan hanya 62). */
export function normalizeWhatsappNumber(input: string): string {
  return (input || "").replace(/\D/g, "");
}

/**
 * WhatsApp @lid privacy ID — bukan nomor telepon yang bisa dihubungi.
 * Contoh: 30331763720201 (14–15 digit, sering prefix 30x).
 */
export function isWhatsappLidDigits(digits: string): boolean {
  const d = normalizeWhatsappNumber(digits);
  if (d.length < 14) {
    return false;
  }
  if (/^30\d{11,}$/.test(d)) {
    return true;
  }
  if (d.length >= 15 && !isLikelyDialablePhone(d)) {
    return true;
  }
  return false;
}

/** Nomor E.164 yang masuk akal untuk WA (semua negara, 8–15 digit). */
export function isLikelyDialablePhone(digits: string): boolean {
  const d = normalizeWhatsappNumber(digits);
  if (d.length < 8 || d.length > 15) {
    return false;
  }
  if (isWhatsappLidDigits(d)) {
    return false;
  }
  return true;
}

export function formatPhoneDisplay(digits: string): string {
  const d = normalizeWhatsappNumber(digits);
  return d ? `+${d}` : "";
}

export function validateGlobalPhoneInput(input: string): {
  ok: boolean;
  normalized: string;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: true, normalized: "" };
  }
  const normalized = normalizeWhatsappNumber(trimmed);
  if (!isLikelyDialablePhone(normalized)) {
    return {
      ok: false,
      normalized,
      error:
        "Nomor tidak valid. Pakai kode negara + nomor (contoh: 85568541476, 6281234567890).",
    };
  }
  return { ok: true, normalized };
}
