/** Frasa yang merujuk lokasi user (IP), bukan nama kota. */
export function isUserLocationPhrase(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  if (
    /^(?:tempat|lokasi)\s*(?:gua|gw|gue|saya|ku)$/i.test(t) ||
    /^(?:di\s+)?(?:tempat|lokasi)\s*(?:gua|gw|gue|saya|ku)$/i.test(t) ||
    /^(?:di\s+)?sini$|^disini$|^here$|^my\s+(?:place|location|city|area)$/i.test(
      t
    ) ||
    /^where\s+i\s+(?:am|live)$/i.test(t) ||
    /^around\s+here$|^near\s+me$/i.test(t) ||
    /^(?:di\s+)?rumah\s*(?:gua|gw|gue|saya|ku)$/i.test(t) ||
    /^sekitar\s+sini$/i.test(t)
  ) {
    return true;
  }

  return (
    /\b(?:tempat|lokasi)\s*(?:gua|gw|gue|saya|ku)\b/i.test(t) ||
    /\b(?:check|cek|lihat|tanya)\s+cuaca\s+(?:di\s+)?(?:tempat|lokasi|sini|here)\b/i.test(
      t
    ) ||
    /\bcuaca\s+(?:di\s+)?(?:tempat|lokasi)\s*(?:gua|gw|gue|saya|ku)\b/i.test(t)
  );
}

function cleanCityCandidate(raw: string): string {
  return raw
    .replace(/^(?:check|cek|lihat|tanya|tolong)\s+/i, "")
    .replace(
      /\s*(?:sekarang|hari ini|today|now|please|tolong|dong|ya|deh|thanks|makasih)\s*$/i,
      ""
    )
    .trim();
}

export function extractWeatherCity(text: string): string | null {
  const trimmed = text.trim();

  if (isUserLocationPhrase(trimmed)) {
    return null;
  }

  const patterns = [
    /\b(?:cuaca|weather)\b.*\b(?:di|in|for)\s+(.+)$/i,
    /\b(?:di|in)\s+(.+?)\s*(?:\?|!|\.)?$/i,
    /^(?:cuaca|weather)\s+(?:di|in|for)?\s*(.+)$/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const candidate = cleanCityCandidate(match?.[1] ?? "");
    if (!candidate || isUserLocationPhrase(candidate)) {
      continue;
    }
    if (candidate.length >= 2 && candidate.length <= 80) {
      return candidate;
    }
  }

  return null;
}
