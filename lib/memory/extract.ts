import "server-only";

import { generateText } from "ai";
import { z } from "zod";
import type { OpenRouterClientMeta } from "@/lib/ai/providers";
import { getTitleModel } from "@/lib/ai/providers";
import type { MemoryCategory } from "@/lib/db/schema";
import { runMemoryHygiene } from "./hygiene";
import type { SavedMemoryItem } from "./notice";
import { POST_EXTRACTION_PROMPT, PRE_EXTRACTION_PROMPT } from "./prompts";
import { saveMemory } from "./queries";
import {
  isExplicitRememberRequest,
  looksLikeMemorableUserMessage,
  shouldPostExtractMemories,
} from "./remember";

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

function hasOpenRouterKey(apiKey?: string): boolean {
  return Boolean(apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim());
}

async function runExtraction({
  system,
  prompt,
  maxItems,
  openRouterApiKey,
  modelId,
  meta,
}: {
  system: string;
  prompt: string;
  maxItems: number;
  openRouterApiKey?: string;
  modelId: string;
  meta?: OpenRouterClientMeta;
}) {
  const { text } = await generateText({
    model: getTitleModel(openRouterApiKey, meta, modelId),
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
  modelId,
  meta,
  mergeSimilar = true,
}: {
  userId: string;
  userMessage: string;
  chatId: string;
  maxPerTurn?: number;
  openRouterApiKey?: string;
  modelId: string;
  meta?: OpenRouterClientMeta;
  mergeSimilar?: boolean;
}): Promise<SavedMemoryItem[]> {
  if (
    !userMessage.trim() ||
    !hasOpenRouterKey(openRouterApiKey) ||
    maxPerTurn < 1
  ) {
    return [];
  }

  const explicit = isExplicitRememberRequest(userMessage);
  if (!explicit && !looksLikeMemorableUserMessage(userMessage)) {
    return [];
  }

  try {
    const items = await runExtraction({
      system: PRE_EXTRACTION_PROMPT,
      prompt: `User said:\n${userMessage.slice(0, 2500)}`,
      maxItems: explicit ? Math.min(maxPerTurn, 3) : Math.min(maxPerTurn, 2),
      openRouterApiKey,
      modelId,
      meta,
    });

    if (items.length === 0) {
      return [];
    }

    const saved: SavedMemoryItem[] = [];
    await Promise.all(
      items.map(async (item) => {
        const id = await saveMemory({
          userId,
          content: item.content,
          category: item.category as MemoryCategory,
          importance: explicit ? Math.max(item.importance, 8) : item.importance,
          sourceChatId: chatId,
          metadata: {
            preExtracted: true,
            explicitRemember: explicit,
          },
          mergeSimilar,
        });
        if (id) {
          saved.push({
            content: item.content,
            category: item.category as MemoryCategory,
          });
        }
      })
    );
    if (saved.length > 0 && mergeSimilar) {
      runMemoryHygiene(userId).catch(() => null);
    }
    return saved;
  } catch (error) {
    console.error("Memory pre-extraction failed:", error);
    return [];
  }
}

export async function extractAndStoreMemories({
  userId,
  userMessage,
  assistantMessage,
  chatId,
  maxPerTurn = 3,
  openRouterApiKey,
  modelId,
  meta,
  mergeSimilar = true,
}: {
  userId: string;
  userMessage: string;
  assistantMessage: string;
  chatId: string;
  maxPerTurn?: number;
  openRouterApiKey?: string;
  modelId: string;
  meta?: OpenRouterClientMeta;
  mergeSimilar?: boolean;
}): Promise<SavedMemoryItem[]> {
  if (
    !userMessage.trim() ||
    !hasOpenRouterKey(openRouterApiKey) ||
    maxPerTurn < 1
  ) {
    return [];
  }

  if (!shouldPostExtractMemories(userMessage, assistantMessage)) {
    return [];
  }

  try {
    const items = await runExtraction({
      system: POST_EXTRACTION_PROMPT,
      prompt: `User said:\n${userMessage.slice(0, 2000)}\n\nAssistant replied:\n${assistantMessage.slice(0, 1500)}`,
      maxItems: maxPerTurn,
      openRouterApiKey,
      modelId,
      meta,
    });

    if (items.length === 0) {
      return [];
    }

    const saved: SavedMemoryItem[] = [];
    await Promise.all(
      items.map(async (item) => {
        const id = await saveMemory({
          userId,
          content: item.content,
          category: item.category as MemoryCategory,
          importance: item.importance,
          sourceChatId: chatId,
          mergeSimilar,
        });
        if (id) {
          saved.push({
            content: item.content,
            category: item.category as MemoryCategory,
          });
        }
      })
    );
    if (saved.length > 0 && mergeSimilar) {
      runMemoryHygiene(userId).catch(() => null);
    }
    return saved;
  } catch (error) {
    console.error("Memory extraction failed:", error);
    return [];
  }
}

export async function runMemoryHygieneIfEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  if (enabled) {
    await runMemoryHygiene(userId).catch(() => null);
  }
}
