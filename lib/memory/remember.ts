const EXPLICIT_REMEMBER =
  /\b(ingat(?:kan)?|jangan lupa|remember(?:\s+this)?|simpan(?:kan)?\s+(?:ini|itu)|catat(?:kan)?|save\s+this|don't forget|dont forget)\b/i;

const MEMORABLE_USER_HINT =
  /\b(nama\s+(?:saya|ku|gue)|saya\s+(?:suka|tidak suka|gak suka|kerja|tinggal|punya|adalah|biasanya|selalu|sering)|aku\s+(?:suka|nggak|gak|kerja|tinggal|punya)|gue\s+(?:suka|kerja|tinggal|biasanya)|biasanya\s+(?:saya|aku|gue)|my\s+name|call\s+me|i\s+(?:prefer|like|work|live|always)|preferensi|hobi|keluarga|pacar|istri|suami|anak|umur\s+\d+|tinggal\s+di|alamat|rencana|target|tujuan|project|usaha|bisnis|modal|gaji|shift|jadwal|dokter|alergi|obat|password|pin\s+\d|rekening|bank|playlist|genre|favorit|kesukaan|tidak suka|allergic)\b/i;

const TRIVIAL_SKIP =
  /^(hi|halo|hello|hey|thanks|makasih|ok|oke|sip|noted|good|bagus|mantap|test)\s*[!.?]*$/i;

export function isExplicitRememberRequest(text: string): boolean {
  return EXPLICIT_REMEMBER.test(text.trim());
}

export function looksLikeMemorableUserMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 10) return false;
  if (TRIVIAL_SKIP.test(t)) return false;
  if (isExplicitRememberRequest(t)) return true;
  if (MEMORABLE_USER_HINT.test(t)) return true;
  if (t.length >= 40 && /\b(saya|aku|gue|my|i'm|i am)\b/i.test(t)) return true;
  return false;
}

/** Skip post-extract pada sapaan / obrolan kosong. */
export function shouldPostExtractMemories(
  userMessage: string,
  assistantMessage: string
): boolean {
  const u = userMessage.trim();
  const a = assistantMessage.trim();
  if (u.length < 8 || a.length < 20) return false;
  if (TRIVIAL_SKIP.test(u)) return false;
  if (isExplicitRememberRequest(u) || looksLikeMemorableUserMessage(u)) {
    return true;
  }
  if (a.length >= 120) return true;
  if (/\b(ingat|preferensi|nama kamu|asisten pribadi)\b/i.test(a)) return true;
  return u.length >= 28;
}
