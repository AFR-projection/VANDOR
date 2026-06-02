import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { putFile } from "@/lib/storage/blob";

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
  error?: { message?: string; code?: number | string };
};

const DEFAULT_MODEL = "google/gemini-2.5-flash-image";

function dataUrlToBuffer(dataUrl: string): { buf: Buffer; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL from image model");
  return { mime: m[1], buf: Buffer.from(m[2], "base64") };
}

export const generateImage = tool({
  description:
    "Generate an image from a text prompt using OpenRouter (default: Google Nano Banana / Gemini Flash Image). Use when the user asks to create, draw, design, illustrate, or generate a picture/photo/logo/illustration. Returns a downloadable PNG URL.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(3)
      .max(2000)
      .describe("Detailed description of the image to generate."),
    aspectRatio: z
      .enum(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"])
      .optional()
      .describe("Aspect ratio (default 1:1)."),
    model: z
      .string()
      .optional()
      .describe(
        `OpenRouter image-output model. Defaults to ${DEFAULT_MODEL}. Other choices: google/gemini-3.1-flash-image-preview, black-forest-labs/flux.2-pro`
      ),
  }),
  execute: async ({ prompt, aspectRatio, model }) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return {
        ok: false as const,
        error: "OPENROUTER_API_KEY not configured.",
      };
    }

    const chosen = model?.trim() || DEFAULT_MODEL;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let resp: Response;
    try {
      resp = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": appUrl,
            "X-Title": "VANDOR",
          },
          body: JSON.stringify({
            model: chosen,
            modalities: ["image", "text"],
            messages: [{ role: "user", content: prompt }],
            ...(aspectRatio && {
              image_config: { aspect_ratio: aspectRatio },
            }),
          }),
        }
      );
    } catch (err) {
      return {
        ok: false as const,
        error: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      return {
        ok: false as const,
        error: `OpenRouter ${resp.status}: ${text.slice(0, 400)}`,
        model: chosen,
      };
    }

    const data = (await resp.json()) as OpenRouterResponse;
    if (data.error) {
      return {
        ok: false as const,
        error: data.error.message ?? "Unknown OpenRouter error",
        model: chosen,
      };
    }

    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!imageUrl) {
      return {
        ok: false as const,
        error:
          "Model returned no image. It may not support image output or your credits are insufficient.",
        model: chosen,
        textResponse: data.choices?.[0]?.message?.content ?? null,
      };
    }

    try {
      const { buf, mime } = dataUrlToBuffer(imageUrl);
      const ext = mime.split("/")[1]?.split("+")[0] ?? "png";
      const stored = await putFile(
        `image-${Date.now()}.${ext}`,
        buf,
        { contentType: mime, addRandomSuffix: true }
      );
      return {
        ok: true as const,
        kind: "image" as const,
        url: stored.url,
        mime,
        bytes: buf.byteLength,
        model: chosen,
        prompt,
        aspectRatio: aspectRatio ?? "1:1",
      };
    } catch (err) {
      return {
        ok: false as const,
        error: `Failed to store image: ${err instanceof Error ? err.message : String(err)}`,
        model: chosen,
      };
    }
  },
});
