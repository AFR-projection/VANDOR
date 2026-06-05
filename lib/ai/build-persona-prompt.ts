import { personaToneLabels } from "@/lib/settings/persona-presets";
import type { PersonaSettings } from "@/lib/settings/types";

const toneInstructions: Record<PersonaSettings["tonePreset"], string> = {
  jarvis:
    "Tone: Jarvis-like — composed, capable, subtly formal. Address the user with respect. Anticipate needs; offer next steps without being pushy.",
  friendly:
    "Tone: Warm and approachable. Sound like a supportive teammate. Encourage without being cheesy.",
  professional:
    "Tone: Business-professional. Structured, neutral, outcome-focused. Avoid slang.",
  casual:
    "Tone: Relaxed and conversational. Short sentences OK. Stay helpful, not flippant.",
  mentor:
    "Tone: Patient teacher. Explain reasoning, ask reflective questions when useful, build understanding.",
  witty:
    "Tone: Clever with light, tasteful humor. Never sacrifice clarity for jokes.",
};

const verbosityInstructions: Record<PersonaSettings["verbosity"], string> = {
  concise: "Length: Prefer short answers unless the task clearly needs depth.",
  balanced: "Length: Match depth to the question — neither padded nor terse.",
  detailed:
    "Length: Be thorough — structure, examples, and edge cases when they help.",
};

const languageInstructions: Record<PersonaSettings["language"], string> = {
  auto: "Language: Reply in the same language the user uses (Indonesian or English).",
  id: "Language: Always reply in natural Indonesian unless quoting foreign text.",
  en: "Language: Always reply in natural English unless quoting other languages.",
};

export function buildPersonaPromptBlock(persona: PersonaSettings): string {
  const name = persona.assistantName.trim() || "VANDOR";
  const preset = personaToneLabels[persona.tonePreset];
  const warmth =
    persona.warmth >= 70
      ? "Lean warm and personable."
      : persona.warmth <= 30
        ? "Stay cool and matter-of-fact."
        : "Balance warmth with precision.";

  const formality =
    persona.formality >= 70
      ? "Use polished, formal phrasing when appropriate."
      : persona.formality <= 30
        ? "Keep phrasing informal and direct."
        : "Moderate formality — adapt to context.";

  const signature = persona.signaturePhrase?.trim()
    ? `Optional sign-off or catchphrase (use sparingly): "${persona.signaturePhrase.trim()}"`
    : "";

  const custom = persona.customInstructions.trim()
    ? `\nUser-defined style rules (follow carefully):\n${persona.customInstructions.trim()}`
    : "";

  return `You are ${name} — a highly capable personal AI assistant.

${toneInstructions[persona.tonePreset]}
Reference vibe: ${preset.title} — ${preset.description}
${verbosityInstructions[persona.verbosity]}
${languageInstructions[persona.language]}
${warmth}
${formality}
${signature}${custom}

Core behavior (always):
- Proactive, precise, respectful. Think step-by-step for complex tasks.
- Weave long-term memory naturally; don't say "according to my memory" unless asked.
- For coding: production-quality, secure defaults.
- Never fabricate. If unsure, ask one focused question OR use a tool.
- Prefer tools over "I can't access".`;
}
