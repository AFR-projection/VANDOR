import { auth } from "@/app/(auth)/auth";
import { getOverview } from "@/lib/autonomous/dashboard";
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

  try {
    const data = await getOverview();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Gagal memuat data agent",
      },
      { status: 500 }
    );
  }
}
