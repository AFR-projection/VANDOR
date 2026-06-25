import "server-only";

import { generateText, type UserContent } from "ai";
import { z } from "zod";
import { getOpenRouterContextForUser } from "@/lib/ai/integration-models";
import { getLanguageModel, resolveOpenRouterApiKeyForUser } from "@/lib/ai/providers";
import type { VaultFileType } from "@/lib/db/schema";

const MAX_VISION_BYTES = 4 * 1024 * 1024;
const AUTO_TAG_TIMEOUT_MS = 18_000;

const autoTagSchema = z.object({
  summary: z.string().min(3).max(500),
  tags: z.array(z.string().min(1).max(32)).max(8),
});

const SYSTEM = `Kamu menandai file untuk berangkas pribadi (vault).
Balas HANYA JSON valid tanpa markdown:
{"summary":"...","tags":["tag1","tag2"]}

Aturan:
- summary: 1 kalimat deskriptif dalam Bahasa Indonesia (max 120 karakter)
- tags: 2-6 tag lowercase, singkat, relevan (tipe file, topik, warna, lokasi, dll)
- Jangan sertakan tag generik seperti "file" atau "upload"`;

function parseAutoTagJson(text: string): { summary: string; tags: string[] } | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return null;
  }
  try {
    const parsed = autoTagSchema.safeParse(JSON.parse(match[0]));
    if (!parsed.success) {
      return null;
    }
    const tags = parsed.data.tags
      .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean)
      .slice(0, 8);
    const summary = parsed.data.summary.trim().slice(0, 500);
    if (!summary || tags.length === 0) {
      return null;
    }
    return { summary, tags };
  } catch {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), ms);
    }),
  ]);
}

/**
 * Suggest human-readable summary + tags for a vault upload using vision/text models.
 * Returns null on failure — caller should fall back to defaults.
 */
export async function suggestVaultMetadata(input: {
  userId: string;
  fileName: string;
  fileType: VaultFileType;
  mimeType: string;
  data: Buffer;
  extractedText?: string | null;
  caption?: string;
}): Promise<{ summary: string; tags: string[] } | null> {
  const apiKey = await resolveOpenRouterApiKeyForUser(input.userId);
  if (!apiKey) {
    return null;
  }

  const ctx = await getOpenRouterContextForUser(input.userId).catch(() => null);
  const modelId =
    input.fileType === "image" && input.data.byteLength <= MAX_VISION_BYTES
      ? (ctx?.models.visionModel ?? "google/gemini-2.5-flash")
      : (ctx?.models.titleModel ?? "google/gemini-2.0-flash-001");

  const contextLines = [
    `Nama file: ${input.fileName}`,
    `Tipe: ${input.fileType}`,
    `MIME: ${input.mimeType}`,
    input.caption ? `Caption: ${input.caption}` : null,
    input.extractedText
      ? `Cuplikan isi:\n${input.extractedText.slice(0, 2000)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  let userContent: UserContent;

  if (
    input.fileType === "image" &&
    input.data.byteLength <= MAX_VISION_BYTES
  ) {
    userContent = [
      {
        type: "image",
        image: `data:${input.mimeType};base64,${input.data.toString("base64")}`,
      },
      {
        type: "text",
        text: `${contextLines}\n\nDeskripsikan gambar ini untuk vault.`,
      },
    ];
  } else {
    userContent = `${contextLines}\n\nBuat summary dan tags untuk file ini.`;
  }

  const run = async () => {
    const { text } = await generateText({
      model: getLanguageModel(modelId, apiKey),
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
      maxOutputTokens: 256,
    });
    return parseAutoTagJson(text);
  };

  return withTimeout(run(), AUTO_TAG_TIMEOUT_MS);
}
