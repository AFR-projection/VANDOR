import { auth } from "@/app/(auth)/auth";
import { bootstrapPlatformV2 } from "@/lib/platform/init";
import { isPlatformV2Enabled } from "@/lib/platform/config";
import { listAgents } from "@/lib/platform/core/agent-registry";
import { listTools } from "@/lib/platform/core/tool-registry";
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

  return Response.json({
    platform: "v2",
    enabled: isPlatformV2Enabled(),
    bootstrapped: boot.enabled,
    agents: boot.enabled ? listAgents().map((a) => ({
      id: a.id,
      name: a.name,
      status: a.runtimeStatus,
      toolCount: a.tools.length,
    })) : [],
    toolCount: boot.tools,
    toolsSample: boot.enabled
      ? listTools().slice(0, 8).map((t) => ({
          name: t.name,
          source: t.source,
        }))
      : [],
  });
}
