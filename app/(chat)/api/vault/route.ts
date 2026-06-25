import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { countVaultFiles, listVaultFiles } from "@/lib/vault/queries";
import { requireVaultSession } from "@/lib/vault/route-auth";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const vaultAuth = await requireVaultSession();
  if (vaultAuth instanceof ChatbotError) {
    return vaultAuth.toResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  const fileType = searchParams.get("type") ?? undefined;
  const tag = searchParams.get("tag") ?? undefined;

  const [files, total] = await Promise.all([
    listVaultFiles({
      userId: vaultAuth.vaultUserId,
      limit,
      offset,
      fileType: fileType as Parameters<typeof listVaultFiles>[0]["fileType"],
      tag,
    }),
    countVaultFiles(vaultAuth.vaultUserId),
  ]);

  return Response.json({ files, total });
}
