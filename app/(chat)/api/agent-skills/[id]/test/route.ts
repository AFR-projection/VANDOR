import { auth } from "@/app/(auth)/auth";
import { getAgentSkillById } from "@/lib/agent-skills/queries";
import { executeAgentSkill } from "@/lib/agent-skills/runner";
import { testSkillSchema } from "@/lib/agent-skills/validation";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;
  const skill = await getAgentSkillById(session.user.id, id);
  if (!skill) {
    return Response.json({ error: "Skill tidak ditemukan" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = testSkillSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Parameter test tidak valid" },
      { status: 400 }
    );
  }

  const result = await executeAgentSkill(
    skill,
    (parsed.data.parameters ?? {}) as Record<string, unknown>,
    { userId: session.user.id }
  );

  return Response.json({
    ok: result.ok,
    data: result.data,
    error: result.error,
    executionTimeMs: result.executionTimeMs,
  });
}
