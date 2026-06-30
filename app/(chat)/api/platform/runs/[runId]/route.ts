import { auth } from "@/app/(auth)/auth";
import { bootstrapPlatformV2 } from "@/lib/platform/init";
import { isPlatformV2Enabled } from "@/lib/platform/config";
import { getWorkflowRunDetailForUser } from "@/lib/platform/dashboard/service";
import { requireClientAccess } from "@/lib/security/client-access";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  bootstrapPlatformV2();

  if (!isPlatformV2Enabled()) {
    return Response.json({ error: "Platform V2 disabled" }, { status: 503 });
  }

  const { runId } = await context.params;
  const detail = await getWorkflowRunDetailForUser(session.user.id, runId);

  if (!detail) {
    return Response.json({ error: "Workflow tidak ditemukan" }, { status: 404 });
  }

  return Response.json({ enabled: true, ...detail });
}
