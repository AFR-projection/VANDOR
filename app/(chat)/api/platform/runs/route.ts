import { auth } from "@/app/(auth)/auth";
import { isPlatformV2Enabled } from "@/lib/platform/config";
import {
  getPlatformDashboardSnapshot,
  listRecentEventsForUser,
  listWorkflowRunsForUser,
  type WorkflowRunFilter,
} from "@/lib/platform/dashboard/service";
import { bootstrapPlatformV2 } from "@/lib/platform/init";
import { requireClientAccess } from "@/lib/security/client-access";

const VALID_FILTERS = new Set<WorkflowRunFilter>([
  "active",
  "completed",
  "failed",
  "all",
]);

export async function GET(request: Request) {
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
    return Response.json({
      enabled: false,
      runs: [],
      events: [],
      snapshot: {
        enabled: false,
        activeRunsGlobal: 0,
        activeRunsUser: 0,
        agents: [],
      },
    });
  }

  const { searchParams } = new URL(request.url);
  const rawFilter = searchParams.get("status") ?? "all";
  const status = VALID_FILTERS.has(rawFilter as WorkflowRunFilter)
    ? (rawFilter as WorkflowRunFilter)
    : "all";
  const limit = Math.min(
    Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20,
    50
  );

  const [runs, events, snapshot] = await Promise.all([
    listWorkflowRunsForUser(session.user.id, { status, limit }),
    listRecentEventsForUser(session.user.id, 25),
    getPlatformDashboardSnapshot(session.user.id),
  ]);

  return Response.json({
    enabled: true,
    filter: status,
    runs,
    events,
    snapshot,
  });
}
