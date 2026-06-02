import "server-only";

import { generateText } from "ai";
import { z } from "zod";
import { getTitleModel } from "@/lib/ai/providers";
import type { MemoryCategory } from "@/lib/db/schema";
import { saveMemory } from "./queries";

const memoryItemSchema = z.object({
  content: z.string().min(3).max(500),
  category: z.enum([
    "fact",
    "preference",
    "goal",
    "person",
    "event",
    "instruction",
  ]),
  importance: z.number().min(1).max(10),
});

function extractionSchema(maxItems: number) {
  return z.object({
    memories: z.array(memoryItemSchema).max(maxItems),
  });
}

const EXTRACTION_PROMPT = `You extract long-term memories about the user for a personal AI assistant (like Jarvis).

Rules:
- Only extract NEW, durable facts (preferences, name, job, goals, relationships, habits, standing instructions).
- Skip greetings, small talk, and one-off questions.
- Return 0-3 items. Empty array if nothing worth remembering.
- Write each memory in third person about the user (e.g. "User prefers Indonesian language").
- importance: 1=trivial, 10=critical life fact.

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;

export async function extractAndStoreMemories({
  userId,
  userMessage,
  assistantMessage,
  chatId,
  maxPerTurn = 3,
  openRouterApiKey,
}: {
  userId: string;
  userMessage: string;
  assistantMessage: string;
  chatId: string;
  maxPerTurn?: number;
  openRouterApiKey?: string;
}): Promise<void> {
  if (!userMessage.trim() || !process.env.OPENROUTER_API_KEY || maxPerTurn < 1) {
    return;
  }

  try {
    const { text } = await generateText({
      model: getTitleModel(openRouterApiKey),
      system: EXTRACTION_PROMPT,
      prompt: `User said:\n${userMessage.slice(0, 2000)}\n\nAssistant replied:\n${assistantMessage.slice(0, 1500)}`,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return;
    }

    const parsed = extractionSchema(maxPerTurn).safeParse(
      JSON.parse(jsonMatch[0])
    );
    if (!parsed.success || parsed.data.memories.length === 0) {
      return;
    }

    await Promise.all(
      parsed.data.memories.map((item) =>
        saveMemory({
          userId,
          content: item.content,
          category: item.category as MemoryCategory,
          importance: item.importance,
          sourceChatId: chatId,
        })
      )
    );
  } catch (error) {
    console.error("Memory extraction failed:", error);
  }
}
