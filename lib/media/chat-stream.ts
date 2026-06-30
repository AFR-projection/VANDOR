import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { MediaSlashCommand } from "@/lib/chat/media-slash";
import { saveMessages } from "@/lib/db/queries";
import {
  downloadSocialMedia,
  formatMediaDownloadReply,
} from "@/lib/media/download";
import type { MediaDownloadProgressData } from "@/lib/media/types";
import { recordMediaDownloadLog } from "@/lib/observability/log-media";
import { generateUUID } from "@/lib/utils";
import { toErrorMessage } from "@/lib/utils/error-message";

export function createMediaDownloadStreamResponse(input: {
  chatId: string;
  userId: string;
  slash: MediaSlashCommand;
  chatTitle?: string;
  consumeSseStream?: Parameters<
    typeof createUIMessageStreamResponse
  >[0]["consumeSseStream"];
}) {
  const stream = createUIMessageStream({
    execute: async ({ writer: dataStream }) => {
      if (input.chatTitle) {
        dataStream.write({
          type: "data-chat-title",
          data: input.chatTitle,
        });
      }

      const pushProgress = (data: MediaDownloadProgressData) => {
        dataStream.write({
          type: "data-media-download-progress",
          data,
        });
      };

      pushProgress({
        status: "validating",
        progress: 4,
        stageLabel: "Memulai unduhan…",
        platform: input.slash.platform,
        format: input.slash.format,
      });

      const result = await downloadSocialMedia(
        {
          url: input.slash.url,
          format: input.slash.format,
          platform: input.slash.platform,
        },
        pushProgress
      );

      recordMediaDownloadLog({
        userId: input.userId,
        chatId: input.chatId,
        command: input.slash.command,
        url: input.slash.url,
        result,
      });

      if (!result.ok) {
        pushProgress({
          status: "error",
          progress: 0,
          stageLabel: "Unduhan gagal",
          platform: input.slash.platform,
          format: input.slash.format,
          error: toErrorMessage(result.error),
        });
      }

      const reply = formatMediaDownloadReply(result);
      const textId = generateId();

      dataStream.write({ type: "text-start", id: textId });
      for (const chunk of reply.match(/.{1,48}/gs) ?? [reply]) {
        dataStream.write({ type: "text-delta", id: textId, delta: chunk });
      }
      dataStream.write({ type: "text-end", id: textId });
    },
    generateId: generateUUID,
    onFinish: async ({ messages: finishedMessages }) => {
      if (finishedMessages.length === 0) {
        return;
      }
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
