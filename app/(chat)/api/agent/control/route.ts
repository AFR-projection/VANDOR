import { auth } from "@/app/(auth)/auth";
import { controlAgent } from "@/lib/autonomous/dashboard";
import { requireClientAccess } from "@/lib/security/client-access";

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { mode?: unknown; killSwitch?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const mode =
    body.mode === "autonomous" || body.mode === "manual"
      ? body.mode
      : undefined;
  const killSwitch =
    typeof body.killSwitch === "boolean" ? body.killSwitch : undefined;

  if (mode === undefined && killSwitch === undefined) {
    return Response.json(
      { error: "Tidak ada perubahan (mode/killSwitch)" },
      { status: 400 }
    );
  }

  await controlAgent({ mode, killSwitch });
  return Response.json({ ok: true });
}
