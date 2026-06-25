import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { requireVaultUnlock } from "@/lib/security/vault-unlock";
import { downloadVaultFile } from "@/lib/vault/retrieve";
import { requireVaultSession } from "@/lib/vault/route-auth";
function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

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
  const file = await downloadVaultFile({
    userId: vaultAuth.vaultUserId,    fileId: id,
    ip: clientIp(request),
  });

  if (!file) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.byteLength),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.fileName)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
