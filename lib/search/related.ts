import "server-only";

import { generateText } from "ai";
import { getTitleModel } from "@/lib/ai/providers";

const RELATED_PROMPT = `You generate follow-up questions a curious user would ask next.

Rules:
- Output 3 to 4 short questions, one per line.
- No numbering, no bullets, no quotes — just the question text.
- Same language as the user's query (Indonesian or English).
- Each question must be specific and naturally extend the topic.
- Do NOT repeat the original question.`;

function parseQuestions(text: string): string[] {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(/^[\s\-*•\d.)]+/, "")
        .replace(/^["']|["']$/g, "")
        .trim()
    )
    .filter((line) => line.length > 5 && line.length < 160)
    .slice(0, 4);
}

export async function generateRelatedQuestions(
  query: string,
  answer: string,
  openRouterApiKey?: string
): Promise<string[]> {
  if (!query.trim()) {
    return [];
  }

  try {
    const { text } = await generateText({
      model: getTitleModel(openRouterApiKey),
      system: RELATED_PROMPT,
      prompt: `Original question: ${query}\n\nAnswer summary:\n${answer.slice(0, 1500)}`,
      temperature: 0.7,
    });
    return parseQuestions(text);
  } catch {
    return [];
  }
}
