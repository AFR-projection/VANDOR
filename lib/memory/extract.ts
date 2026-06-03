import "server-only";

import { generateText } from "ai";
import { z } from "zod";
import { getTitleModel } from "@/lib/ai/providers";
import type { MemoryCategory } from "@/lib/db/schema";
import {
  isExplicitRememberRequest,
  looksLikeMemorableUserMessage,
} from "./remember";
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

const POST_EXTRACTION_PROMPT = `You extract long-term memories about the user for a personal AI assistant (like Jarvis).

Rules:
- Only extract NEW, durable facts (preferences, name, job, goals, relationships, habits, standing instructions).
- Skip greetings, small talk, and one-off questions.
- Return 0-3 items. Empty array if nothing worth remembering.
- Write each memory in third person about the user (e.g. "User prefers Indonesian language").
- importance: 1=trivial, 10=critical life fact.

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;

const PRE_EXTRACTION_PROMPT = `You extract long-term memories from the USER message only (before the assistant replies).

Rules:
- Focus on durable facts the user states about themselves (name, job, preferences, goals, people, standing instructions).
- If the user says "remember" / "ingat" / "jangan lupa", treat as high importance (8-10).
- Return 0-2 items. Empty array if nothing worth storing yet.
- Third person about the user.
- Do not invent facts not in the message.

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;

async function runExtraction({
  system,
  prompt,
  maxItems,
  openRouterApiKey,
}: {
  system: string;
  prompt: string;
  maxItems: number;
  openRouterApiKey?: string;
}) {
  const { text } = await generateText({
    model: getTitleModel(openRouterApiKey),
    system,
    prompt,
  });

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return [];
  }

  const parsed = extractionSchema(maxItems).safeParse(JSON.parse(jsonMatch[0]));
  if (!parsed.success) {
    return [];
  }
  return parsed.data.memories;
}

export async function preExtractUserMemories({
  userId,
  userMessage,
  chatId,
  maxPerTurn = 2,
  openRouterApiKey,
  mergeSimilar = true,
}: {
  userId: string;
  userMessage: string;
  chatId: string;
  maxPerTurn?: number;
  openRouterApiKey?: string;
  mergeSimilar?: boolean;
}): Promise<void> {
  if (!userMessage.trim() || !process.env.OPENROUTER_API_KEY || maxPerTurn < 1) {
    return;
  }

  const explicit = isExplicitRememberRequest(userMessage);
  if (!explicit && !looksLikeMemorableUserMessage(userMessage)) {
    return;
  }

  try {
    const items = await runExtraction({
      system: PRE_EXTRACTION_PROMPT,
      prompt: `User said:\n${userMessage.slice(0, 2500)}`,
      maxItems: explicit ? Math.min(maxPerTurn, 3) : Math.min(maxPerTurn, 2),
      openRouterApiKey,
    });

    if (items.length === 0) {
      return;
    }

    await Promise.all(
      items.map((item) =>
        saveMemory({
          userId,
          content: item.content,
          category: item.category as MemoryCategory,
          importance: explicit
            ? Math.max(item.importance, 8)
            : item.importance,
          sourceChatId: chatId,
          metadata: {
            preExtracted: true,
            explicitRemember: explicit,
          },
          mergeSimilar,
        })
      )
    );
  } catch (error) {
    console.error("Memory pre-extraction failed:", error);
  }
}

export async function extractAndStoreMemories({
  userId,
  userMessage,
  assistantMessage,
  chatId,
  maxPerTurn = 3,
  openRouterApiKey,
  mergeSimilar = true,
}: {
  userId: string;
  userMessage: string;
  assistantMessage: string;
  chatId: string;
  maxPerTurn?: number;
  openRouterApiKey?: string;
  mergeSimilar?: boolean;
}): Promise<void> {
  if (!userMessage.trim() || !process.env.OPENROUTER_API_KEY || maxPerTurn < 1) {
    return;
  }

  try {
    const items = await runExtraction({
      system: POST_EXTRACTION_PROMPT,
      prompt: `User said:\n${userMessage.slice(0, 2000)}\n\nAssistant replied:\n${assistantMessage.slice(0, 1500)}`,
      maxItems: maxPerTurn,
      openRouterApiKey,
    });

    if (items.length === 0) {
      return;
    }

    await Promise.all(
      items.map((item) =>
        saveMemory({
          userId,
          content: item.content,
          category: item.category as MemoryCategory,
          importance: item.importance,
          sourceChatId: chatId,
          mergeSimilar,
        })
      )
    );
  } catch (error) {
    console.error("Memory extraction failed:", error);
  }
}
