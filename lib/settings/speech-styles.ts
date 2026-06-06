import { z } from "zod";
import type { PersonaSettings } from "./types";

export const speechStyleSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(48),
  description: z.string().max(300),
  instructions: z.string().min(8).max(6000),
  samplePhrase: z.string().max(240),
  builtIn: z.boolean().optional(),
});

export type SpeechStyle = z.infer<typeof speechStyleSchema>;

const DEFAULT_SPEECH_STYLE: SpeechStyle = {
  id: "default",
  name: "Default",
  description: "",
  instructions:
    "Gaya netral: jelas, membantu, adaptif bahasa user. Tanpa persona khusus sampai user menambahkan gaya sendiri.",
  samplePhrase: "Halo! Saya siap membantu.",
  builtIn: false,
};

function isLegacyBuiltinStyle(style: SpeechStyle): boolean {
  return Boolean(style.builtIn) || style.id.startsWith("builtin:");
}

export function createCustomSpeechStyle(
  partial: Pick<SpeechStyle, "name" | "instructions"> &
    Partial<Pick<SpeechStyle, "description" | "samplePhrase">>
): SpeechStyle {
  const slug = partial.name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .slice(0, 24);
  return {
    id: `custom:${slug}-${Date.now().toString(36)}`,
    name: partial.name.trim(),
    description: partial.description?.trim() ?? "",
    instructions: partial.instructions.trim(),
    samplePhrase: partial.samplePhrase?.trim() ?? "",
    builtIn: false,
  };
}

export function migratePersonaSettings(
  persona: Partial<PersonaSettings>
): PersonaSettings {
  const styles = Array.isArray(persona.styles)
    ? persona.styles.filter(
        (s) =>
          s?.id &&
          s?.name &&
          s?.instructions &&
          !isLegacyBuiltinStyle(s as SpeechStyle)
      )
    : [];

  let activeStyleId = persona.activeStyleId?.trim() ?? "";
  if (
    activeStyleId.startsWith("builtin:") ||
    !styles.some((s) => s.id === activeStyleId)
  ) {
    activeStyleId = styles[0]?.id ?? "";
  }

  return {
    assistantName: persona.assistantName?.trim() || "VANDOR",
    activeStyleId,
    styles: styles.slice(0, 24),
    tonePreset: persona.tonePreset,
    language: persona.language ?? "auto",
    verbosity: persona.verbosity ?? "balanced",
    warmth: persona.warmth ?? 55,
    formality: persona.formality ?? 45,
    customInstructions: persona.customInstructions ?? "",
    signaturePhrase: persona.signaturePhrase ?? "",
  };
}

export function resolveActiveSpeechStyle(
  persona: PersonaSettings
): SpeechStyle {
  const migrated = migratePersonaSettings(persona);
  return (
    migrated.styles.find((s) => s.id === migrated.activeStyleId) ??
    DEFAULT_SPEECH_STYLE
  );
}

export function parseImportedSpeechStyles(raw: unknown): SpeechStyle[] {
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && "styles" in raw) {
    const nested = (raw as { styles: unknown }).styles;
    items = Array.isArray(nested) ? nested : [];
  } else if (raw && typeof raw === "object") {
    items = [raw];
  }

  const out: SpeechStyle[] = [];
  for (const item of items) {
    const single = speechStyleSchema
      .omit({ id: true })
      .extend({ id: z.string().optional() })
      .safeParse(item);
    if (!single.success) continue;
    const data = single.data;
    out.push({
      id: data.id?.trim() || `import:${Date.now().toString(36)}-${out.length}`,
      name: data.name,
      description: data.description ?? "",
      instructions: data.instructions,
      samplePhrase: data.samplePhrase ?? "",
      builtIn: false,
    });
  }
  return out.slice(0, 12);
}

export function exportSpeechStylesJson(styles: SpeechStyle[]): string {
  return JSON.stringify(
    styles.map(({ name, description, instructions, samplePhrase }) => ({
      name,
      description,
      instructions,
      samplePhrase,
    })),
    null,
    2
  );
}
