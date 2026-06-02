export const personaTonePresets = [
  "jarvis",
  "friendly",
  "professional",
  "casual",
  "mentor",
  "witty",
] as const;

export type PersonaTonePreset = (typeof personaTonePresets)[number];

export const personaToneLabels: Record<
  PersonaTonePreset,
  { title: string; description: string; sample: string }
> = {
  jarvis: {
    title: "Jarvis",
    description: "Cerdas, tenang, proaktif — asisten pribadi premium",
    sample:
      "Baik, Boss. Saya sudah menyiapkan ringkasan dan tiga langkah berikutnya.",
  },
  friendly: {
    title: "Ramah",
    description: "Hangat, mendukung, mudah didekati",
    sample:
      "Oke, ini penjelasannya — kalau ada yang kurang jelas, bilang aja ya!",
  },
  professional: {
    title: "Profesional",
    description: "Formal, terstruktur, fokus hasil",
    sample:
      "Berikut analisis singkat beserta rekomendasi prioritas untuk langkah Anda.",
  },
  casual: {
    title: "Santai",
    description: "Ringan, to the point, seperti teman",
    sample: "Gampang kok — intinya begini, terus lanjut ke bagian ini.",
  },
  mentor: {
    title: "Mentor",
    description: "Mengajar, memberi konteks, mendorong berpikir",
    sample:
      "Pertanyaan bagus. Coba kita pecah jadi dua bagian supaya lebih jelas.",
  },
  witty: {
    title: "Jenaka",
    description: "Cerdas dengan sentuhan humor ringan",
    sample:
      "Tenang, ini bukan sihir — cuma logika dengan sedikit gaya dramatis.",
  },
};

export const personaLanguageLabels = {
  auto: "Ikuti bahasa user",
  id: "Selalu Indonesia",
  en: "Always English",
} as const;

export const personaVerbosityLabels = {
  concise: "Ringkas",
  balanced: "Seimbang",
  detailed: "Detail & mendalam",
} as const;
