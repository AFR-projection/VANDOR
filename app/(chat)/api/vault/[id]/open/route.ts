import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { requireVaultUnlock } from "@/lib/security/vault-unlock";
import { getVaultFileById } from "@/lib/vault/queries";
import { decryptVaultFile } from "@/lib/vault/retrieve";
import { requireVaultSession } from "@/lib/vault/route-auth";
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

  const vaultDenied = await requireVaultUnlock(request);
  if (vaultDenied) return vaultDenied;

  const vaultAuth = await requireVaultSession();
  if (vaultAuth instanceof ChatbotError) {
    return vaultAuth.toResponse();
  }

  const { id } = await params;
  const record = await getVaultFileById({
    userId: vaultAuth.vaultUserId,
    fileId: id,
  });
  if (!record) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  const file = await decryptVaultFile({
    userId: vaultAuth.vaultUserId,    fileId: id,
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
