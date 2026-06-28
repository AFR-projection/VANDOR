import { DEFAULT_FREE_MODEL_CHAIN } from "@/lib/ai/free-models";

export {
  DEFAULT_FREE_MODEL_CHAIN,
  OPENROUTER_FREE_MODEL_POOL,
} from "@/lib/ai/free-models";

export const OPENROUTER_MODEL_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i;

export type ModelSlotKey =
  // Mode Gratis — fallback chain (1 → 2 → 3)
  | "freeModel1"
  | "freeModel2"
  | "freeModel3"
  // Mode Auto — per agent
  | "chatModel"
  | "reasoningModel"
  | "codingModel"
  | "researchModel"
  | "visionModel"
  | "longContextModel"
  // Generate / tools
  | "imageModel"
  | "videoModel"
  | "voiceModel"
  | "transcriptionModel"
  | "documentModel"
  // Memori & sistem
  | "embeddingModel"
  | "rerankModel"
  | "titleModel";

export type ModelSlotGroupId = "free" | "agents" | "generate" | "system";

export type ModelSlotDefinition = {
  key: ModelSlotKey;
  label: string;
  description: string;
  placeholder: string;
  group: ModelSlotGroupId;
  /** When empty, the resolver falls back to this slot (agent inheritance). */
  fallbackSlot?: ModelSlotKey;
};

export const MODEL_SLOT_GROUPS: {
  id: ModelSlotGroupId;
  title: string;
  subtitle: string;
}[] = [
  {
    id: "free",
    title: "Mode Gratis (3 model fallback)",
    subtitle:
      "Hanya model :free (contoh: openrouter/free, moonshotai/...:free). Model berbayar otomatis diganti. Jika #1 limit → #2 → #3.",
  },
  {
    id: "agents",
    title: "Mode Auto · Model per Agent",
    subtitle:
      "Orchestrator memilih agent sesuai jenis task. Kosongkan untuk mewarisi model Chat Agent.",
  },
  {
    id: "generate",
    title: "Agent Generate (gambar, video, file)",
    subtitle:
      "Model untuk membuat gambar, video, suara, transkripsi, dan dokumen.",
  },
  {
    id: "system",
    title: "Memori & Sistem",
    subtitle: "Embedding, rerank, dan judul chat.",
  },
];

export const MODEL_SLOT_DEFINITIONS: ModelSlotDefinition[] = [
  // ── Mode Gratis ──
  {
    key: "freeModel1",
    label: "Free #1 (utama)",
    description:
      "Model gratis pertama. Wajib tier :free (contoh: openrouter/free).",
    placeholder: "openrouter/free",
    group: "free",
  },
  {
    key: "freeModel2",
    label: "Free #2 (cadangan)",
    description: "Dipakai jika #1 kena limit.",
    placeholder: "moonshotai/kimi-k2.6:free",
    group: "free",
  },
  {
    key: "freeModel3",
    label: "Free #3 (cadangan)",
    description: "Dipakai jika #1 dan #2 kena limit.",
    placeholder: "google/gemini-2.0-flash-exp:free",
    group: "free",
  },
  // ── Mode Auto · Agent ──
  {
    key: "chatModel",
    label: "Chat Agent",
    description:
      "Percakapan umum & task ringan. Jadi induk fallback agent lain.",
    placeholder: "google/gemini-2.5-flash",
    group: "agents",
  },
  {
    key: "reasoningModel",
    label: "Reasoning Agent",
    description: "Analisis mendalam, perbandingan, rencana multi-langkah.",
    placeholder: "google/gemini-2.5-flash",
    group: "agents",
    fallbackSlot: "chatModel",
  },
  {
    key: "codingModel",
    label: "Coding Agent",
    description: "Kode, debug, refactor, artifacts.",
    placeholder: "anthropic/claude-haiku-4.5",
    group: "agents",
    fallbackSlot: "chatModel",
  },
  {
    key: "researchModel",
    label: "Research Agent",
    description: "Web search, berita, fakta terkini.",
    placeholder: "google/gemini-2.5-flash",
    group: "agents",
    fallbackSlot: "chatModel",
  },
  {
    key: "visionModel",
    label: "Vision Agent",
    description: "Memahami gambar/media yang dilampirkan.",
    placeholder: "google/gemini-2.5-flash",
    group: "agents",
    fallbackSlot: "chatModel",
  },
  {
    key: "longContextModel",
    label: "Long Context Agent",
    description: "Dokumen besar / konteks panjang (>25k karakter).",
    placeholder: "google/gemini-2.5-flash",
    group: "agents",
    fallbackSlot: "chatModel",
  },
  // ── Generate ──
  {
    key: "imageModel",
    label: "Generate gambar",
    description: "Tool generateImage.",
    placeholder: "google/gemini-2.5-flash-image",
    group: "generate",
  },
  {
    key: "videoModel",
    label: "Generate video",
    description: "Tool generateVideo. Kosongkan jika tidak dipakai.",
    placeholder: "",
    group: "generate",
  },
  {
    key: "voiceModel",
    label: "Generate suara",
    description: "Tool generateVoice (TTS). Kosongkan jika tidak dipakai.",
    placeholder: "",
    group: "generate",
  },
  {
    key: "transcriptionModel",
    label: "Transkripsi audio",
    description: "Tool transcribeAudio & input mikrofon web. Kosong = pakai Vision/Chat Agent.",
    placeholder: "google/gemini-2.5-flash",
    group: "generate",
  },
  {
    key: "documentModel",
    label: "Generate dokumen (PDF/Excel/file)",
    description: "Pembuatan konten artifact. Kosong = pakai Coding/Chat Agent.",
    placeholder: "anthropic/claude-haiku-4.5",
    group: "generate",
    fallbackSlot: "codingModel",
  },
  // ── Sistem ──
  {
    key: "embeddingModel",
    label: "Embeddings (memori)",
    description: "Vektor memori jangka panjang.",
    placeholder: "openai/text-embedding-3-small",
    group: "system",
  },
  {
    key: "rerankModel",
    label: "Rerank (memori)",
    description: "Re-ranking pencarian memori. Kosongkan untuk lewati.",
    placeholder: "",
    group: "system",
  },
  {
    key: "titleModel",
    label: "Judul chat",
    description: "Generate judul otomatis.",
    placeholder: "google/gemini-2.0-flash-001",
    group: "system",
  },
];

export const DEFAULT_MODEL_SLOTS: Record<ModelSlotKey, string> = {
  freeModel1: DEFAULT_FREE_MODEL_CHAIN[0],
  freeModel2: DEFAULT_FREE_MODEL_CHAIN[1],
  freeModel3: DEFAULT_FREE_MODEL_CHAIN[2],
  chatModel: "google/gemini-2.5-flash",
  reasoningModel: "",
  codingModel: "",
  researchModel: "google/gemini-2.5-flash",
  visionModel: "google/gemini-2.5-flash",
  longContextModel: "google/gemini-2.5-flash",
  imageModel: "google/gemini-2.5-flash-image",
  videoModel: "",
  voiceModel: "",
  transcriptionModel: "google/gemini-2.5-flash",
  documentModel: "",
  embeddingModel: "openai/text-embedding-3-small",
  rerankModel: "",
  titleModel: "google/gemini-2.0-flash-001",
};

export function isValidOpenRouterModelId(modelId: string): boolean {
  const trimmed = modelId.trim();
  if (!trimmed) return false;
  return OPENROUTER_MODEL_ID_PATTERN.test(trimmed);
}

export function normalizeModelId(modelId: string): string {
  return modelId.trim();
}

export function displayModelLabel(modelId: string): string {
  const id = normalizeModelId(modelId);
  if (!id) return "Pilih model";
  const slash = id.lastIndexOf("/");
  if (slash === -1) return id;
  const name = id.slice(slash + 1);
  return name.length > 28 ? `${name.slice(0, 26)}…` : name;
}

export function isLikelyFreeModel(modelId: string): boolean {
  const id = modelId.toLowerCase().trim();
  return id.includes(":free") || id === "openrouter/free";
}

const FREE_SLOT_KEYS = ["freeModel1", "freeModel2", "freeModel3"] as const;

/** Force free slots to valid :free IDs; invalid entries reset to defaults. */
export function sanitizeFreeModelSlots(
  slots: Record<(typeof FREE_SLOT_KEYS)[number], string | undefined>
): {
  freeModel1: string;
  freeModel2: string;
  freeModel3: string;
  fixed: string[];
} {
  const fixed: string[] = [];
  const out = {} as Record<(typeof FREE_SLOT_KEYS)[number], string>;

  for (let i = 0; i < FREE_SLOT_KEYS.length; i++) {
    const key = FREE_SLOT_KEYS[i];
    const raw = slots[key]?.trim() ?? "";
    const fallback = DEFAULT_FREE_MODEL_CHAIN[i];
    if (!raw || !isLikelyFreeModel(raw)) {
      if (raw && !isLikelyFreeModel(raw)) {
        fixed.push(`${raw} → ${fallback}`);
      }
      out[key] = fallback;
    } else {
      out[key] = raw;
    }
  }

  return { ...out, fixed };
}
