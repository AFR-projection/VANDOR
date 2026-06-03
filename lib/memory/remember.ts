const EXPLICIT_REMEMBER =
  /\b(ingat(?:kan)?|jangan lupa|remember(?:\s+this)?|simpan(?:kan)?\s+(?:ini|itu)|catat(?:kan)?|save\s+this|don't forget|dont forget)\b/i;

const MEMORABLE_USER_HINT =
  /\b(nama\s+(?:saya|ku)|saya\s+(?:suka|tidak suka|kerja|tinggal|punya)|aku\s+(?:suka|nggak|gak|kerja)|my\s+name|call\s+me|i\s+(?:prefer|like|work|live)|preferensi|biasanya\s+saya)\b/i;

export function isExplicitRememberRequest(text: string): boolean {
  return EXPLICIT_REMEMBER.test(text.trim());
}

export function looksLikeMemorableUserMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (isExplicitRememberRequest(t)) return true;
  return MEMORABLE_USER_HINT.test(t);
}
