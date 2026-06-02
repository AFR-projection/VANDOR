import "server-only";

import { generateText } from "ai";
import { getTitleModel } from "@/lib/ai/providers";

const POLISH_PROMPT = `You are a response editor. Rewrite the assistant message to be:
- Natural and warm like ChatGPT
- Clear structure (paragraphs, bullets when helpful)
- No repetition or filler ("Sure!", "Great question!")
- Same language as the original (Indonesian or English)
- Keep all facts, citations [1], links, and technical details intact
- Do NOT add new facts

Return ONLY the polished message text. No preamble.`;

export function cleanResponseSync(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^(Sure!|Great question!|Tentu!|Baik,)\s*/i, "")
    .replace(/^(As an AI( language model)?,?)\s*/i, "")
    .trim();
}

export async function polishResponse(
  text: string,
  openRouterApiKey?: string
): Promise<string> {
  if (process.env.VANDOR_DISABLE_POLISH === "1") {
    return cleanResponseSync(text);
  }

  const cleaned = cleanResponseSync(text);
  if (cleaned.length < 80) {
    return cleaned;
  }

  try {
    const { text: polished } = await generateText({
      model: getTitleModel(openRouterApiKey),
      system: POLISH_PROMPT,
      prompt: cleaned.slice(0, 6000),
      temperature: 0.3,
    });

    const result = polished.trim();
    return result.length > 20 ? result : cleaned;
  } catch {
    return cleaned;
  }
}
