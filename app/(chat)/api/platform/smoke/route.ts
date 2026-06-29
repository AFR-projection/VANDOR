import { auth } from "@/app/(auth)/auth";
import { isPlatformV2Enabled } from "@/lib/platform/config";
import { bootstrapPlatformV2 } from "@/lib/platform/init";
import { runPingWorkflow } from "@/lib/platform/smoke/ping-workflow";
import { requireClientAccess } from "@/lib/security/client-access";

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPlatformV2Enabled()) {
    return Response.json(
      {
        error: "Platform V2 disabled",
        hint: "Set PLATFORM_V2_ENABLED=true in .env.local",
      },
      { status: 503 }
    );
  }

  bootstrapPlatformV2();

  try {
    const result = await runPingWorkflow({
      userId: session.user.id,
    });
    return Response.json(result, {
      status: result.ok ? 200 : 500,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Smoke test failed",
      },
      { status: 500 }
    );
  }
}
