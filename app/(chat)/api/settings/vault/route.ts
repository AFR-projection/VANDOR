import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { listRecentVaultAudit } from "@/lib/vault/audit";
import { countVaultFiles, listVaultFiles } from "@/lib/vault/queries";
import { requireVaultSession } from "@/lib/vault/route-auth";
import { getVaultStorageStatus } from "@/lib/vault/storage-status";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const vaultAuth = await requireVaultSession();
  if (vaultAuth instanceof ChatbotError) {
    return vaultAuth.toResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const search = searchParams.get("search") ?? undefined;
  const fileType = searchParams.get("type") ?? undefined;

  const [files, total, audit] = await Promise.all([
    listVaultFiles({
      userId: vaultAuth.vaultUserId,
      limit,
      search,
      fileType: fileType as Parameters<typeof listVaultFiles>[0]["fileType"],
    }),
    countVaultFiles(vaultAuth.vaultUserId),
    listRecentVaultAudit({ userId: vaultAuth.vaultUserId, limit: 12 }),
  ]);

  return Response.json({
    files,
    total,
    filteredCount: files.length,
    audit,
    security: await getVaultStorageStatus(),
  });
}
