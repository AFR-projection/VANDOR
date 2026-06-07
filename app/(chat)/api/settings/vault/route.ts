import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { listRecentVaultAudit } from "@/lib/vault/audit";
import { countVaultFiles, listVaultFiles } from "@/lib/vault/queries";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
  const search = searchParams.get("search") ?? undefined;
  const fileType = searchParams.get("type") ?? undefined;

  const [files, total, audit] = await Promise.all([
    listVaultFiles({
      userId: session.user.id,
      limit,
      search,
      fileType: fileType as Parameters<typeof listVaultFiles>[0]["fileType"],
    }),
    countVaultFiles(session.user.id),
    listRecentVaultAudit({ userId: session.user.id, limit: 12 }),
  ]);

  return Response.json({
    files,
    total,
    audit,
    security: {
      encrypted: true,
      algorithm: "AES-256-GCM",
      storage: "Cloudflare R2",
      metadata: "Neon PostgreSQL + pgvector",
    },
  });
}
