import "server-only";

import {
  getOpenRouterContextForUser,
  resolveTranscriptionModel,
} from "@/lib/ai/integration-models";
import { openRouterFetch } from "@/lib/ai/openrouter-http";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type SttResponse = {
  text?: string;
};

/** Map MIME → format OpenRouter input_audio (bukan URL — audio wajib base64). */
function audioFormatFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("ogg")) {
    return "ogg";
  }
  if (m.includes("webm")) {
    return "webm";
  }
  if (m.includes("mp4") || m.includes("m4a")) {
    return "m4a";
  }
  if (m.includes("mpeg") || m.includes("mp3")) {
    return "mp3";
  }
  if (m.includes("wav")) {
    return "wav";
  }
  if (m.includes("aac")) {
    return "aac";
  }
  if (m.includes("flac")) {
    return "flac";
  }
  return "ogg";
}

async function transcribeViaChat(
  ctx: Awaited<ReturnType<typeof getOpenRouterContextForUser>>,
  model: string,
  base64: string,
  format: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const result = await openRouterFetch<ChatCompletionResponse>({
    ctx,
    path: "/chat/completions",
    body: {
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this audio accurately in the user's language (Indonesian or English). Return ONLY the transcript text, no commentary.",
            },
            {
              type: "input_audio",
              input_audio: { data: base64, format },
            },
          ],
        },
      ],
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const text = result.data.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    return {
      ok: false,
      error: "Transkripsi kosong — coba bicara lebih jelas.",
    };
  }
  return { ok: true, text };
}

/** Fallback: endpoint STT khusus (Whisper) bila model multimodal gagal. */
async function transcribeViaStt(
  ctx: Awaited<ReturnType<typeof getOpenRouterContextForUser>>,
  base64: string,
  format: string
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const result = await openRouterFetch<SttResponse>({
    ctx,
    path: "/audio/transcriptions",
    body: {
      model: "openai/whisper-large-v3",
      input_audio: { data: base64, format },
    },
  });

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const text = result.data.text?.trim() ?? "";
  if (!text) {
    return { ok: false, error: "Transkripsi kosong (STT)." };
  }
  return { ok: true, text };
}

export async function transcribeAudioBuffer({
  userId,
  buffer,
  contentType,
}: {
  userId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ctx = await getOpenRouterContextForUser(userId);
  if (!ctx.apiKey) {
    return {
      ok: false,
      error:
        "OpenRouter API key belum diatur. Isi di Pengaturan → API & integrasi.",
    };
  }

  const model = resolveTranscriptionModel(ctx);
  if (!model) {
    return {
      ok: false,
      error:
        "Model transkripsi belum diatur. Set di Pengaturan → Model & AI → Transkripsi audio.",
    };
  }

  const base64 = buffer.toString("base64");
  const format = audioFormatFromMime(contentType || "audio/webm");

  // Browser mic records webm — multimodal chat often rejects it; try Whisper STT first.
  if (format === "webm") {
    const sttFirst = await transcribeViaStt(ctx, base64, format);
    if (sttFirst.ok) {
      return sttFirst;
    }
  }

  const primary = await transcribeViaChat(ctx, model, base64, format);
  if (primary.ok) {
    return primary;
  }

  const fallback = await transcribeViaStt(ctx, base64, format);
  if (fallback.ok) {
    return fallback;
  }

  return {
    ok: false,
    error: primary.error || fallback.error || "Transkripsi gagal",
  };
}
