import { auth } from "@/app/(auth)/auth";
import { isPlatformV2Enabled } from "@/lib/platform/config";
import { listAgents } from "@/lib/platform/core/agent-registry";
import { listTools } from "@/lib/platform/core/tool-registry";
import { getPlatformDashboardSnapshot } from "@/lib/platform/dashboard/service";
import { bootstrapPlatformV2 } from "@/lib/platform/init";
import { countActiveWorkflowRuns } from "@/lib/platform/queue/claim-runs";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const boot = bootstrapPlatformV2();
  const enabled = isPlatformV2Enabled();

  const [activeRunsGlobal, snapshot] = enabled
    ? await Promise.all([
        countActiveWorkflowRuns(),
        getPlatformDashboardSnapshot(session.user.id),
      ])
    : [0, null];

  return Response.json({
    platform: "v2",
    enabled,
    bootstrapped: boot.enabled,
    activeRunsGlobal,
    activeRunsUser: snapshot?.activeRunsUser ?? 0,
    agents: boot.enabled
      ? listAgents().map((a) => ({
          id: a.id,
          name: a.name,
          status: a.runtimeStatus,
          toolCount: a.tools.length,
        }))
      : [],
    toolCount: boot.tools,
    toolsSample: boot.enabled
      ? listTools()
          .slice(0, 8)
          .map((t) => ({
            name: t.name,
            source: t.source,
          }))
      : [],
  });
}
