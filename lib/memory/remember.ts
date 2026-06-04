const EXPLICIT_REMEMBER =
  /\b(ingat(?:kan)?|jangan lupa|remember(?:\s+this)?|simpan(?:kan)?\s+(?:ini|itu)|catat(?:kan)?|save\s+this|don't forget|dont forget)\b/i;

const MEMORABLE_USER_HINT =
  /\b(nama\s+(?:saya|ku|gue)|saya\s+(?:suka|tidak suka|gak suka|kerja|tinggal|punya|adalah)|aku\s+(?:suka|nggak|gak|kerja|tinggal|punya)|gue\s+(?:suka|kerja|tinggal)|biasanya\s+(?:saya|aku)|my\s+name|call\s+me|i\s+(?:prefer|like|work|live)|preferensi|hobi|keluarga|pacar|istri|suami|anak|umur\s+\d+|tinggal\s+di)\b/i;

export function isExplicitRememberRequest(text: string): boolean {
  return EXPLICIT_REMEMBER.test(text.trim());
}

export function looksLikeMemorableUserMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (isExplicitRememberRequest(t)) return true;
  return MEMORABLE_USER_HINT.test(t);
}
