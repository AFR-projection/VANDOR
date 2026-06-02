import "server-only";

import type { ExtractedFile } from "@/lib/files/extract";
import { countVisualMemories, saveMemory } from "./queries";

export async function captureVisualMemories({
  userId,
  chatId,
  userMessage,
  imageFiles,
  maxVisualMemories,
}: {
  userId: string;
  chatId: string;
  userMessage: string;
  imageFiles: ExtractedFile[];
  maxVisualMemories: number;
}): Promise<void> {
  if (imageFiles.length === 0) {
    return;
  }

  const current = await countVisualMemories(userId);
  if (current >= maxVisualMemories) {
    return;
  }

  for (const file of imageFiles.slice(0, 2)) {
    const caption = userMessage.trim() || file.name;
    const content = `User shared a visual: ${file.name}. Context: ${caption}`;

    await saveMemory({
      userId,
      content,
      category: "event",
      importance: 6,
      sourceChatId: chatId,
      metadata: {
        visual: true,
        fileName: file.name,
        mime: file.mime,
        url: file.url,
      },
    });
  }
}
