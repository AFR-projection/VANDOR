import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { countVaultFiles, listVaultFiles } from "@/lib/vault/queries";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? 40), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? 0), 0);
  const fileType = searchParams.get("type") ?? undefined;
  const tag = searchParams.get("tag") ?? undefined;

  const [files, total] = await Promise.all([
    listVaultFiles({
      userId: session.user.id,
      limit,
      offset,
      fileType: fileType as Parameters<typeof listVaultFiles>[0]["fileType"],
      tag,
    }),
    countVaultFiles(session.user.id),
  ]);

  return Response.json({ files, total });
}
