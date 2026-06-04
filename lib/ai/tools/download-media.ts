import { tool } from "ai";
import { z } from "zod";
import { isUrlForPlatform } from "@/lib/chat/media-slash";
import {
  downloadSocialMedia,
  formatMediaDownloadReply,
} from "@/lib/media/download";

const platformSchema = z.enum(["tiktok", "youtube", "instagram", "auto"]);

export function makeDownloadMediaTool() {
  return tool({
    description:
      "Download video/audio from TikTok, YouTube, or Instagram. Use for /tt, /ytv, /yts, /ig or when user asks to download/save media from a link. Returns a hosted download URL (Vercel Blob/R2).",
    inputSchema: z.object({
      url: z.string().url(),
      format: z.enum(["video", "audio"]).default("video"),
      platform: platformSchema.default("auto"),
    }),
    execute: async ({ url, format, platform: platformIn }) => {
      let platform = platformIn;
      if (platform === "auto") {
        if (isUrlForPlatform(url, "tiktok")) platform = "tiktok";
        else if (isUrlForPlatform(url, "instagram")) platform = "instagram";
        else if (isUrlForPlatform(url, "youtube")) platform = "youtube";
        else {
          return {
            ok: false,
            error:
              "URL tidak dikenali. Gunakan link TikTok, YouTube, atau Instagram.",
          };
        }
      }

      if (!isUrlForPlatform(url, platform)) {
        return {
          ok: false,
          error: `URL tidak cocok untuk platform ${platform}.`,
        };
      }

      const result = await downloadSocialMedia({ url, format, platform });
      return {
        ...result,
        message: formatMediaDownloadReply(result),
      };
    },
  });
}
