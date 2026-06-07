import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { getVaultFileById } from "@/lib/vault/queries";
import { decryptVaultFile } from "@/lib/vault/retrieve";

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

/**
 * Explicit vault open for active chat session only.
 * Decrypts file so AI can process attachments in the current turn.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await params;
  const record = await getVaultFileById({
    userId: session.user.id,
    fileId: id,
  });
  if (!record) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const file = await decryptVaultFile({
    userId: session.user.id,
    fileId: id,
    ip: clientIp(request),
    auditDetail: { purpose: "chat_open" },
  });

  if (!file) {
    return Response.json({ error: "Failed to open vault file" }, { status: 500 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.byteLength),
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
