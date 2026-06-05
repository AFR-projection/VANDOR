import "server-only";

import {
  getOpenRouterContextForUser,
  pickModel,
} from "@/lib/ai/integration-models";
import { openRouterFetch } from "@/lib/ai/openrouter-http";
import { putFile } from "@/lib/storage/blob";

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function transcribeAudioBuffer({
  userId,
  buffer,
  contentType,
}: {
  userId: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const stored = await putFile(`voice-${Date.now()}.webm`, buffer, {
    contentType: contentType || "audio/webm",
    addRandomSuffix: true,
  });

  const ctx = await getOpenRouterContextForUser(userId);
  const chosen = pickModel(ctx, "transcriptionModel");
  if (!chosen.trim()) {
    return {
      ok: false,
      error:
        "Model transkripsi belum diatur. Set di tier model atau Pengaturan → API.",
    };
  }

  const result = await openRouterFetch<OpenRouterResponse>({
    ctx,
    path: "/chat/completions",
    body: {
      model: chosen,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this audio accurately. Return only the transcript text.",
            },
            { type: "input_audio", input_audio: { url: stored.url } },
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
