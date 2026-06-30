import "server-only";

import { tool } from "ai";
import { z } from "zod";
import {
  getOpenRouterContextForUser,
  pickModel,
  resolveTranscriptionModel,
} from "@/lib/ai/integration-models";
import { openRouterFetch } from "@/lib/ai/openrouter-http";
import { putFile } from "@/lib/storage/blob";
import { transcribeAudioBuffer } from "@/lib/voice/transcribe";
import { formatWhatsappSticker } from "@/lib/whatsapp/sticker-format";

type OpenRouterImage = {
  image_url?: { url?: string };
};

type OpenRouterChoice = {
  message?: {
    content?: string | null;
    images?: OpenRouterImage[];
  };
};

type OpenRouterResponse = {
  choices?: OpenRouterChoice[];
  error?: { message?: string };
};

const DEFAULT_IMAGE_GEN_MODEL = "google/gemini-2.5-flash-image";

/** Chat/vision models cannot return generated images — fall back to an image-capable model. */
function resolveImageGenModel(modelId: string): string {
  const id = modelId.trim();
  if (!id) return DEFAULT_IMAGE_GEN_MODEL;
  if (
    /^(openai\/gpt-4|openai\/o\d|anthropic\/claude|meta-llama\/llama-3\.[23])/i.test(
      id
    )
  ) {
    return DEFAULT_IMAGE_GEN_MODEL;
  }
  return id;
}

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL from image model");
  return { mime: m[1], buf: Buffer.from(m[2], "base64") };
}

async function storeGeneratedImage(
  imageUrl: string,
  meta: {
    model: string;
    prompt?: string;
    instruction?: string;
    aspectRatio?: string;
  }
) {
  const { buf, mime } = dataUrlToBuffer(imageUrl);
  const ext = mime.split("/")[1]?.split("+")[0] ?? "png";
  const stored = await putFile(`image-${Date.now()}.${ext}`, buf, {
    contentType: mime,
    addRandomSuffix: true,
  });
  return {
    ok: true as const,
    kind: "image" as const,
    url: stored.url,
    mime,
    bytes: buf.byteLength,
    ...meta,
    aspectRatio: meta.aspectRatio ?? "1:1",
  };
}

async function callImageModel(params: {
  ctx: Awaited<ReturnType<typeof getOpenRouterContextForUser>>;
  model: string;
  messages: { role: "user"; content: string | object[] }[];
  aspectRatio?: string;
}) {
  const chosen = resolveImageGenModel(params.model);
  const result = await openRouterFetch<OpenRouterResponse>({
    ctx: params.ctx,
    path: "/chat/completions",
    body: {
      model: chosen,
      modalities: ["image", "text"],
      messages: params.messages,
      ...(params.aspectRatio && {
        image_config: { aspect_ratio: params.aspectRatio },
      }),
    },
  });
  return { result, chosen };
}

function isAllowedImageUrl(url: string, allowedUrls: string[]): boolean {
  if (allowedUrls.includes(url)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host.endsWith(".public.blob.vercel-storage.com") ||
      host === "public.blob.vercel-storage.com" ||
      host === "localhost" ||
      host === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

export async function runGenerateImageForUser(
  userId: string,
  input: {
    prompt: string;
    aspectRatio?: "1:1" | "4:3" | "3:4" | "16:9" | "9:16" | "21:9";
    model?: string;
  }
) {
  const ctx = await getOpenRouterContextForUser(userId);
  const slotModel = pickModel(ctx, "imageModel", input.model);
  const { result, chosen } = await callImageModel({
    ctx,
    model: slotModel,
    messages: [{ role: "user", content: input.prompt }],
    aspectRatio: input.aspectRatio,
  });

  if (!result.ok) {
    return { ok: false as const, error: result.error, model: chosen };
  }

  const data = result.data;
  const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!imageUrl) {
    return {
      ok: false as const,
      error:
        "Model tidak mengembalikan gambar. Cek model di Pengaturan → API atau kredit OpenRouter.",
      model: chosen,
      textResponse: data.choices?.[0]?.message?.content ?? null,
    };
  }

  try {
    return await storeGeneratedImage(imageUrl, {
      model: chosen,
      prompt: input.prompt,
      aspectRatio: input.aspectRatio ?? "1:1",
    });
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : String(err),
      model: chosen,
    };
  }
}

export function makeGenerateImageTool(userId: string) {
  return tool({
    description:
      "Generate a NEW image from a text prompt via OpenRouter. Use when the user asks to create, draw, or illustrate — NOT for editing an uploaded photo (use editImage instead).",
    inputSchema: z.object({
      prompt: z.string().min(3).max(2000),
      aspectRatio: z
        .enum(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"])
        .optional(),
      model: z
        .string()
        .optional()
        .describe("Override OpenRouter image model ID from settings."),
    }),
    execute: async ({ prompt, aspectRatio, model }) =>
      runGenerateImageForUser(userId, { prompt, aspectRatio, model }),
  });
}

export function makeEditImageTool(
  userId: string,
  allowedImageUrls: string[] = []
) {
  return tool({
    description:
      "Edit or transform an image the user uploaded (change hair, background, style, retouch, inpaint). Requires imageUrl from the Attached files block plus a clear instruction. Use when the user asks to modify/edit their photo — never refuse or suggest external apps.",
    inputSchema: z.object({
      imageUrl: z
        .string()
        .url()
        .describe("Public URL of the uploaded image from Attached files."),
      instruction: z
        .string()
        .min(3)
        .max(2000)
        .describe(
          "What to change, e.g. make hair bald while keeping the face identical."
        ),
      aspectRatio: z
        .enum(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"])
        .optional(),
      model: z.string().optional(),
    }),
    execute: async ({ imageUrl, instruction, aspectRatio, model }) => {
      if (!isAllowedImageUrl(imageUrl, allowedImageUrls)) {
        return {
          ok: false as const,
          error:
            "URL gambar tidak valid. Gunakan URL persis dari blok Attached files pada pesan ini.",
          model: "",
        };
      }

      const ctx = await getOpenRouterContextForUser(userId);
      const slotModel = pickModel(ctx, "imageModel", model);
      const editPrompt = `Edit this image according to the user's request. Preserve identity and important details unless the user asks otherwise.

User request: ${instruction}`;

      const { result, chosen } = await callImageModel({
        ctx,
        model: slotModel,
        aspectRatio,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: editPrompt },
            ],
          },
        ],
      });

      if (!result.ok) {
        return { ok: false as const, error: result.error, model: chosen };
      }

      const data = result.data;
      const outUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!outUrl) {
        return {
          ok: false as const,
          error:
            "Model tidak mengembalikan gambar hasil edit. Pastikan imageModel mendukung generasi gambar (mis. google/gemini-2.5-flash-image) dan kredit OpenRouter cukup.",
          model: chosen,
          textResponse: data.choices?.[0]?.message?.content ?? null,
        };
      }

      try {
        return await storeGeneratedImage(outUrl, {
          model: chosen,
          instruction,
          aspectRatio: aspectRatio ?? "1:1",
        });
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
          model: chosen,
        };
      }
    },
  });
}

export function makeGenerateVideoTool(userId: string) {
  return tool({
    description:
      "Generate a short video clip from a text prompt via OpenRouter. Use when the user explicitly asks for video generation.",
    inputSchema: z.object({
      prompt: z.string().min(3).max(2000),
      model: z.string().optional(),
    }),
    execute: async ({ prompt, model }) => {
      const ctx = await getOpenRouterContextForUser(userId);
      const chosen = pickModel(ctx, "videoModel", model);
      if (!chosen.trim()) {
        return {
          ok: false as const,
          error:
            "Model video belum diatur. Isi di Pengaturan → API & integrasi → Generate video.",
          model: "",
        };
      }

      const result = await openRouterFetch<OpenRouterResponse>({
        ctx,
        path: "/chat/completions",
        body: {
          model: chosen,
          modalities: ["video", "text"],
          messages: [{ role: "user", content: prompt }],
        },
      });

      if (!result.ok) {
        return { ok: false as const, error: result.error, model: chosen };
      }

      const content = result.data.choices?.[0]?.message?.content;
      return {
        ok: true as const,
        model: chosen,
        prompt,
        result: content ?? "Video request submitted — check model output.",
      };
    },
  });
}

export function makeGenerateVoiceTool(userId: string) {
  return tool({
    description:
      "Generate spoken audio (TTS) from text via OpenRouter voice model.",
    inputSchema: z.object({
      text: z.string().min(1).max(4000),
      model: z.string().optional(),
    }),
    execute: async ({ text, model }) => {
      const ctx = await getOpenRouterContextForUser(userId);
      const chosen = pickModel(ctx, "voiceModel", model);
      if (!chosen.trim()) {
        return {
          ok: false as const,
          error:
            "Model suara belum diatur. Isi di Pengaturan → API & integrasi → Generate suara.",
          model: "",
        };
      }

      const result = await openRouterFetch<OpenRouterResponse>({
        ctx,
        path: "/chat/completions",
        body: {
          model: chosen,
          modalities: ["audio", "text"],
          messages: [{ role: "user", content: text }],
        },
      });

      if (!result.ok) {
        return { ok: false as const, error: result.error, model: chosen };
      }

      return {
        ok: true as const,
        model: chosen,
        text,
        result:
          result.data.choices?.[0]?.message?.content ?? "Audio generated.",
      };
    },
  });
}

export function makeTranscribeAudioTool(userId: string) {
  return tool({
    description:
      "Transcribe audio to text. Provide a public URL to an audio file (mp3, wav, m4a, ogg).",
    inputSchema: z.object({
      audioUrl: z.string().url(),
      model: z.string().optional(),
    }),
    execute: async ({ audioUrl, model }) => {
      const ctx = await getOpenRouterContextForUser(userId);
      const chosen = resolveTranscriptionModel(ctx, model);
      if (!chosen.trim()) {
        return {
          ok: false as const,
          error:
            "Model transkripsi belum diatur. Isi di Pengaturan → Model & AI → Transkripsi audio.",
          model: "",
        };
      }

      let buffer: Buffer;
      let contentType = "audio/mpeg";
      try {
        const resp = await fetch(audioUrl);
        if (!resp.ok) {
          return {
            ok: false as const,
            error: `Gagal unduh audio: HTTP ${resp.status}`,
            model: chosen,
          };
        }
        contentType =
          resp.headers.get("content-type")?.split(";")[0]?.trim() ??
          contentType;
        buffer = Buffer.from(await resp.arrayBuffer());
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Gagal unduh file audio",
          model: chosen,
        };
      }

      const result = await transcribeAudioBuffer({
        userId,
        buffer,
        contentType,
      });

      if (!result.ok) {
        return { ok: false as const, error: result.error, model: chosen };
      }

      return {
        ok: true as const,
        model: chosen,
        transcript: result.text,
      };
    },
  });
}

async function imageBufferFromPrompt(
  userId: string,
  prompt: string,
  model?: string
): Promise<
  { ok: true; buffer: Buffer; model: string } | { ok: false; error: string }
> {
  const ctx = await getOpenRouterContextForUser(userId);
  const chosen = resolveImageGenModel(
    pickModel(ctx, "imageModel", model) || DEFAULT_IMAGE_GEN_MODEL
  );
  const { result } = await callImageModel({
    ctx,
    model: chosen,
    aspectRatio: "1:1",
    messages: [
      {
        role: "user",
        content: `Create a fun WhatsApp sticker illustration: ${prompt}. Simple, bold, expressive, suitable as a chat sticker. No text unless user asked for text.`,
      },
    ],
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const images = result.data.choices?.[0]?.message?.images;
  const imageUrl = images?.[0]?.image_url?.url;
  if (!imageUrl) {
    return { ok: false, error: "Model tidak mengembalikan gambar." };
  }

  const { buf } = dataUrlToBuffer(imageUrl);
  return { ok: true, buffer: buf, model: chosen };
}

export function makeCreateWhatsappStickerTool(userId: string) {
  return tool({
    description:
      "Buat stiker WhatsApp (WebP 512×512) dari prompt teks atau konversi gambar dari URL. Hasil otomatis dikirim sebagai stiker di WhatsApp.",
    inputSchema: z.object({
      prompt: z
        .string()
        .optional()
        .describe(
          "Deskripsi stiker yang ingin dibuat (wajib jika tanpa imageUrl)."
        ),
      imageUrl: z
        .string()
        .url()
        .optional()
        .describe("URL gambar sumber untuk dijadikan stiker."),
      model: z.string().optional(),
    }),
    execute: async ({ prompt, imageUrl, model }) => {
      if (!prompt?.trim() && !imageUrl) {
        return {
          ok: false as const,
          error: "Isi prompt atau imageUrl untuk membuat stiker.",
        };
      }

      let source: Buffer;
      let usedModel = model ?? "";

      if (imageUrl) {
        try {
          const resp = await fetch(imageUrl, { redirect: "follow" });
          if (!resp.ok) {
            return {
              ok: false as const,
              error: `Gagal unduh gambar: HTTP ${resp.status}`,
            };
          }
          source = Buffer.from(await resp.arrayBuffer());
        } catch (err) {
          return {
            ok: false as const,
            error:
              err instanceof Error ? err.message : "Gagal unduh gambar sumber",
          };
        }
      } else {
        const generated = await imageBufferFromPrompt(
          userId,
          prompt?.trim() ?? "",
          model
        );
        if (!generated.ok) {
          return { ok: false as const, error: generated.error };
        }
        source = generated.buffer;
        usedModel = generated.model;
      }

      let stickerBuf: Buffer;
      try {
        stickerBuf = await formatWhatsappSticker(source);
      } catch (err) {
        return {
          ok: false as const,
          error:
            err instanceof Error ? err.message : "Gagal format stiker WebP",
        };
      }

      const stored = await putFile(`sticker-${Date.now()}.webp`, stickerBuf, {
        contentType: "image/webp",
        addRandomSuffix: true,
      });

      return {
        ok: true as const,
        kind: "sticker" as const,
        url: stored.url,
        mime: "image/webp",
        filename: "sticker.webp",
        bytes: stickerBuf.byteLength,
        prompt: prompt?.trim(),
        model: usedModel || undefined,
      };
    },
  });
}
