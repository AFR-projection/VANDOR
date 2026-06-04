import { auth } from "@/app/(auth)/auth";
import { requireClientAccess } from "@/lib/security/client-access";
import { transcribeAudioBuffer } from "@/lib/voice/transcribe";

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "File audio wajib" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength < 100) {
    return Response.json({ error: "Audio terlalu pendek" }, { status: 400 });
  }
  if (buffer.byteLength > 12 * 1024 * 1024) {
    return Response.json({ error: "Audio maks 12 MB" }, { status: 400 });
  }

  const result = await transcribeAudioBuffer({
    userId: session.user.id,
    buffer,
    contentType: file.type || "audio/webm",
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ text: result.text });
}
