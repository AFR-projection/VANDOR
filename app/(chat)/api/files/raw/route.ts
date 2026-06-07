import { auth } from "@/app/(auth)/auth";
import { isChatFileKey } from "@/lib/files/chat-file-url";
import { requireClientAccess } from "@/lib/security/client-access";
import { getR2Object } from "@/lib/storage/r2";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
};

function guessMime(key: string): string {
  const lower = key.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) {
    if (lower.endsWith(ext)) {
      return mime;
    }
  }
  return "application/octet-stream";
}

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  if (!isChatFileKey(key)) {
    return Response.json({ error: "Invalid file key" }, { status: 400 });
  }

  try {
    const data = await getR2Object(key);
    const fileName = key.split("/").pop() ?? "file";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": guessMime(key),
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 });
  }
}
