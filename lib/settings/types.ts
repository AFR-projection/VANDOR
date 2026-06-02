import { z } from "zod";
import { memoryCategories } from "@/lib/db/schema";
import { personaTonePresets } from "./persona-presets";

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
  tonePreset: z.enum(personaTonePresets),
  language: z.enum(["auto", "id", "en"]),
  verbosity: z.enum(["concise", "balanced", "detailed"]),
  warmth: z.number().int().min(0).max(100),
  formality: z.number().int().min(0).max(100),
  customInstructions: z.string().max(2500),
  signaturePhrase: z.string().max(120),
});

export const integrationsSettingsSchema = z.object({
  embeddingModel: z.string().min(3).max(120),
  webSearchModel: z.string().max(120),
  openrouterAppName: z.string().min(1).max(64),
  openrouterAppUrl: z.string().max(256),
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
    semanticSearchLimit: 12,
    recentMemoriesLimit: 8,
    minSimilarity: 0.72,
    maxExtractPerTurn: 3,
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
  persona: {
    assistantName: "VANDOR",
    tonePreset: "jarvis",
    language: "auto",
    verbosity: "balanced",
    warmth: 55,
    formality: 45,
    customInstructions: "",
    signaturePhrase: "",
  },
  integrations: {
    embeddingModel: "openai/text-embedding-3-small",
    webSearchModel: "",
    openrouterAppName: "VANDOR",
    openrouterAppUrl: "",
  },
};

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
    persona: { ...defaultUserSettings.persona, ...partial.persona },
    integrations: {
      ...defaultUserSettings.integrations,
      ...partial.integrations,
    },
  };
}
