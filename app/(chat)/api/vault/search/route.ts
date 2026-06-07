import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { searchVaultFiles } from "@/lib/vault/queries";

const schema = z.object({
  query: z.string().min(2).max(500),
  limit: z.number().int().min(1).max(20).optional(),
  fileType: z.string().optional(),
});

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await searchVaultFiles({
    userId: session.user.id,
    query: parsed.data.query,
    limit: parsed.data.limit ?? 10,
    fileType: parsed.data.fileType as Parameters<
      typeof searchVaultFiles
    >[0]["fileType"],
    ip: clientIp(request),
  });

  return Response.json(result);
}
