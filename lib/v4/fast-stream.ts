import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { CustomUIDataTypes } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { saveMessages } from "@/lib/db/queries";

type InstantStatus = CustomUIDataTypes["instant-status"];

export function createFastTextStreamResponse(input: {
  chatId: string;
  instant: InstantStatus;
  text: string;
  extraParts?: Array<{ type: string; data: unknown }>;
  consumeSseStream?: Parameters<
    typeof createUIMessageStreamResponse
  >[0]["consumeSseStream"];
}) {
  const stream = createUIMessageStream({
    execute: async ({ writer: dataStream }) => {
      dataStream.write({
        type: "data-instant-status",
        data: { ...input.instant, phase: "start" },
      });

      for (const part of input.extraParts ?? []) {
        dataStream.write(
          part as { type: `data-${string}`; data: unknown }
        );
      }

      const textId = generateId();
      dataStream.write({ type: "text-start", id: textId });
      for (const chunk of input.text.match(/.{1,48}/gs) ?? [input.text]) {
        dataStream.write({ type: "text-delta", id: textId, delta: chunk });
      }
      dataStream.write({ type: "text-end", id: textId });

      dataStream.write({
        type: "data-instant-status",
        data: { ...input.instant, phase: "done" },
      });
    },
    generateId: generateUUID,
    onFinish: async ({ messages: finishedMessages }) => {
      if (finishedMessages.length === 0) return;
      await saveMessages({
        messages: finishedMessages.map((m) => ({
          id: m.id,
          chatId: input.chatId,
          role: m.role,
          parts: m.parts,
          attachments: [],
          createdAt: new Date(),
        })),
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    consumeSseStream: input.consumeSseStream,
  });
}
