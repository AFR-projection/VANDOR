import { auth } from "@/app/(auth)/auth";
import { listActivityLogs } from "@/lib/observability/record";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(20, Number.parseInt(url.searchParams.get("limit") ?? "100", 10))
  );

  const events = await listActivityLogs(session.user.id, limit);
  return Response.json({ events });
}
