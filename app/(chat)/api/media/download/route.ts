import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { parseMediaSlash } from "@/lib/chat/media-slash";
import {
  downloadSocialMedia,
  formatMediaDownloadReply,
} from "@/lib/media/download";

export const maxDuration = 120;

const bodySchema = z.object({
  url: z.string().url().optional(),
  text: z.string().optional(),
  format: z.enum(["video", "audio"]).optional(),
  platform: z.enum(["tiktok", "youtube", "instagram"]).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const slash = parsed.data.text ? parseMediaSlash(parsed.data.text) : null;
  const url = slash?.url ?? parsed.data.url;
  const format = slash?.format ?? parsed.data.format ?? "video";
  const platform = slash?.platform ?? parsed.data.platform;

  if (!url || !platform) {
    return NextResponse.json(
      {
        error:
          "Butuh url + platform, atau text slash (/tt, /ytv, /yts, /ig <link>).",
      },
      { status: 400 }
    );
  }

  const result = await downloadSocialMedia({ url, format, platform });
  return NextResponse.json({
    ...result,
    message: formatMediaDownloadReply(result),
  });
}
