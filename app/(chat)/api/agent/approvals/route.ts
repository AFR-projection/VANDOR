import { auth } from "@/app/(auth)/auth";
import {
  decideApproval,
  resumeApprovedTask,
} from "@/lib/autonomous/permission";
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

  let body: { id?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : "";
  const decision =
    body.decision === "approved" || body.decision === "rejected"
      ? body.decision
      : null;

  if (!id || !decision) {
    return Response.json(
      { error: "id & decision (approved|rejected) wajib" },
      { status: 400 }
    );
  }

  const ok = await decideApproval(
    id,
    decision,
    session.user.email ?? session.user.id
  );
  if (!ok) {
    return Response.json(
      { error: "Approval tidak ditemukan atau sudah diputuskan" },
      { status: 404 }
    );
  }
  if (decision === "approved") {
    await resumeApprovedTask(id);
  }
  return Response.json({ ok: true });
}
