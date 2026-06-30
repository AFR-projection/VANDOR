const SAFE_TRACE_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /search|cari|sumber|source|web/i,
    label: "Mencari sumber relevan",
  },
  {
    pattern: /compar|banding|evaluat|analisa|analyze/i,
    label: "Membandingkan informasi",
  },
  {
    pattern: /summar|ringkas|susun|draft|jawab|answer|response/i,
    label: "Menyusun jawaban",
  },
  {
    pattern: /plan|langkah|step|strateg/i,
    label: "Merencanakan langkah kerja",
  },
  {
    pattern: /read|baca|document|dokumen/i,
    label: "Membaca dokumen",
  },
  {
    pattern: /verify|valid|cek|check/i,
    label: "Memverifikasi informasi",
  },
];

/** Filtered thinking trace — never expose raw chain-of-thought. */
export function toSafeThinkingTrace(reasoningText: string): string[] {
  const traces: string[] = [];
  const lower = reasoningText.toLowerCase();

  for (const { pattern, label } of SAFE_TRACE_PATTERNS) {
    if (pattern.test(lower) && !traces.includes(label)) {
      traces.push(label);
    }
  }

  if (traces.length === 0 && reasoningText.trim().length > 20) {
    traces.push("Menganalisis informasi");
  }

  return traces.slice(0, 4);
}

export function defaultThinkingTrace(isStreaming: boolean): string {
  return isStreaming ? "Menganalisis informasi" : "Analisis selesai";
}
