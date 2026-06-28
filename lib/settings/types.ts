import { z } from "zod";

import {
  DEFAULT_MODEL_TIER,
  inferTierFromLegacySlots,
  MODEL_TIER_IDS,
} from "@/lib/ai/model-tiers";

import { memoryCategories } from "@/lib/db/schema";

import { personaTonePresets } from "./persona-presets";
import { migratePersonaSettings, speechStyleSchema } from "./speech-styles";

export const modelTierSchema = z.enum(MODEL_TIER_IDS);

export const integrationsSettingsSchema = z.object({
  modelTier: modelTierSchema,

  openrouterAppName: z.string().min(1).max(64),

  openrouterAppUrl: z.string().max(256),

  /** Cloudflare R2 — non-secret fields */
  r2AccountId: z.string().max(64),
  r2BucketName: z.string().max(128),
  r2PublicUrl: z.string().max(512),

  /** Cobalt media downloader */
  cobaltApiUrl: z.string().max(512),
  cobaltAllowPublic: z.boolean(),

  /** OpenRouter embedding model for memory */
  memoryEmbeddingModel: z.string().max(128),

  /** Comma-separated owner numbers (digits / +62…) */
  whatsappOwnerNumbers: z.string().max(512),

  /** Nomor owner utama — alert Operator & approve via WA (628…). */
  whatsappPrimaryOwner: z.string().max(32),

  whatsappModel: z.string().max(128),
});

const categoryFlagsSchema = z.object({
  fact: z.boolean(),

  preference: z.boolean(),

  goal: z.boolean(),

  person: z.boolean(),

  event: z.boolean(),

  instruction: z.boolean(),
});

export const memorySettingsSchema = z.object({
  enabled: z.boolean(),

  autoExtract: z.boolean(),

  injectInPrompt: z.boolean(),

  semanticSearchLimit: z.number().int().min(1).max(24),

  recentMemoriesLimit: z.number().int().min(0).max(24),

  minSimilarity: z.number().min(0.4).max(0.95),

  maxExtractPerTurn: z.number().int().min(0).max(5),

  /** Extract from user message before the assistant reply (parallel with recall). */
  preExtractFromUser: z.boolean(),

  /** Merge or update rows when a new fact is semantically similar. */
  mergeSimilarMemories: z.boolean(),

  /** Auto-merge duplikat & rapikan memori usang setelah simpan. */
  autoHygiene: z.boolean(),

  enabledCategories: categoryFlagsSchema,
});

export const visualMemorySettingsSchema = z.object({
  enabled: z.boolean(),

  autoCaptureFromImages: z.boolean(),

  includeInRecall: z.boolean(),

  maxVisualMemories: z.number().int().min(5).max(100),
});

export const advancedSettingsSchema = z.object({
  webSearchAuto: z.boolean(),

  responsePolish: z.boolean(),

  responseCache: z.boolean(),

  conversationSummary: z.boolean(),

  summaryInterval: z.number().int().min(5).max(50),

  richContentLevel: z.enum(["auto", "minimal", "rich"]),
});

export const personaSettingsSchema = z.object({
  assistantName: z.string().min(1).max(32),

  /** Gaya bicara aktif (custom:* atau import). Kosong = gaya default. */
  activeStyleId: z.string().max(64),

  /** Gaya bicara kustom — buat atau import sendiri. */
  styles: z.array(speechStyleSchema).max(24),

  /** @deprecated — dipetakan ke activeStyleId saat migrasi. */
  tonePreset: z.enum(personaTonePresets).optional(),

  language: z.enum(["auto", "id", "en"]),

  verbosity: z.enum(["concise", "balanced", "detailed"]),

  warmth: z.number().int().min(0).max(100),

  formality: z.number().int().min(0).max(100),

  customInstructions: z.string().max(2500),

  signaturePhrase: z.string().max(120),
});

export const userSettingsSchema = z.object({
  memory: memorySettingsSchema,

  visualMemory: visualMemorySettingsSchema,

  advanced: advancedSettingsSchema,

  persona: personaSettingsSchema,

  integrations: integrationsSettingsSchema,
});

export type MemorySettings = z.infer<typeof memorySettingsSchema>;

export type VisualMemorySettings = z.infer<typeof visualMemorySettingsSchema>;

export type AdvancedSettings = z.infer<typeof advancedSettingsSchema>;

export type PersonaSettings = z.infer<typeof personaSettingsSchema>;

export type IntegrationsSettings = z.infer<typeof integrationsSettingsSchema>;

export type UserSettings = z.infer<typeof userSettingsSchema>;

export const defaultEnabledCategories = Object.fromEntries(
  memoryCategories.map((c) => [c, true])
) as Record<(typeof memoryCategories)[number], boolean>;

export const defaultUserSettings: UserSettings = {
  memory: {
    enabled: true,

    autoExtract: true,

    injectInPrompt: true,

    semanticSearchLimit: 16,

    recentMemoriesLimit: 12,

    minSimilarity: 0.65,

    maxExtractPerTurn: 5,

    preExtractFromUser: true,

    mergeSimilarMemories: true,

    autoHygiene: true,

    enabledCategories: { ...defaultEnabledCategories },
  },

  visualMemory: {
    enabled: true,

    autoCaptureFromImages: true,

    includeInRecall: true,

    maxVisualMemories: 30,
  },

  advanced: {
    webSearchAuto: true,

    responsePolish: true,

    responseCache: true,

    conversationSummary: true,

    summaryInterval: 15,

    richContentLevel: "auto",
  },

  persona: migratePersonaSettings({
    assistantName: "VANDOR",
    activeStyleId: "",
    styles: [],
    language: "auto",

    verbosity: "balanced",

    warmth: 55,

    formality: 45,

    customInstructions:
      "Patuhi sapaan & gaya user (Boss, Bapak, dll.) tanpa debat. Mode obrolan bebas untuk owner — ikut nada user, jangan ceramah meta-AI. Vault & keamanan sistem tidak pernah dilewati.",

    signaturePhrase: "",
  }),

  integrations: {
    modelTier: DEFAULT_MODEL_TIER,

    openrouterAppName: "VANDOR",

    openrouterAppUrl: "",

    r2AccountId: "",

    r2BucketName: "",

    r2PublicUrl: "",

    cobaltApiUrl: "",

    cobaltAllowPublic: false,

    memoryEmbeddingModel: "",

    whatsappOwnerNumbers: "",

    whatsappPrimaryOwner: "",

    whatsappModel: "",
  },
};

function migrateIntegrations(
  raw: Record<string, unknown>
): IntegrationsSettings {
  const parsed = integrationsSettingsSchema.safeParse(raw);

  if (parsed.success) {
    return parsed.data;
  }

  const modelTier = (() => {
    if (typeof raw.modelTier === "string") {
      const t = raw.modelTier.trim();

      const result = modelTierSchema.safeParse(t);

      if (result.success) return result.data;
    }

    return inferTierFromLegacySlots(raw);
  })();

  return {
    modelTier,

    openrouterAppName:
      typeof raw.openrouterAppName === "string" && raw.openrouterAppName.trim()
        ? raw.openrouterAppName.trim().slice(0, 64)
        : defaultUserSettings.integrations.openrouterAppName,

    openrouterAppUrl:
      typeof raw.openrouterAppUrl === "string"
        ? raw.openrouterAppUrl.slice(0, 256)
        : "",

    r2AccountId:
      typeof raw.r2AccountId === "string"
        ? raw.r2AccountId.trim().slice(0, 64)
        : "",

    r2BucketName:
      typeof raw.r2BucketName === "string"
        ? raw.r2BucketName.trim().slice(0, 128)
        : "",

    r2PublicUrl:
      typeof raw.r2PublicUrl === "string"
        ? raw.r2PublicUrl.trim().slice(0, 512)
        : "",

    cobaltApiUrl:
      typeof raw.cobaltApiUrl === "string"
        ? raw.cobaltApiUrl.trim().slice(0, 512)
        : "",

    cobaltAllowPublic: raw.cobaltAllowPublic === true,

    memoryEmbeddingModel:
      typeof raw.memoryEmbeddingModel === "string"
        ? raw.memoryEmbeddingModel.trim().slice(0, 128)
        : "",

    whatsappOwnerNumbers:
      typeof raw.whatsappOwnerNumbers === "string"
        ? raw.whatsappOwnerNumbers.trim().slice(0, 512)
        : "",

    whatsappPrimaryOwner:
      typeof raw.whatsappPrimaryOwner === "string"
        ? raw.whatsappPrimaryOwner.trim().slice(0, 32)
        : "",

    whatsappModel:
      typeof raw.whatsappModel === "string"
        ? raw.whatsappModel.trim().slice(0, 128)
        : "",
  };
}

export function mergeUserSettings(
  partial: Partial<UserSettings> | null | undefined
): UserSettings {
  if (!partial) {
    return defaultUserSettings;
  }

  return {
    memory: { ...defaultUserSettings.memory, ...partial.memory },

    visualMemory: {
      ...defaultUserSettings.visualMemory,

      ...partial.visualMemory,
    },

    advanced: { ...defaultUserSettings.advanced, ...partial.advanced },

    persona: migratePersonaSettings({
      ...defaultUserSettings.persona,
      ...partial.persona,
    }),

    integrations: migrateIntegrations(
      (partial.integrations ?? {}) as Record<string, unknown>
    ),
  };
}
