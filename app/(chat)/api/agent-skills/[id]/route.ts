import { auth } from "@/app/(auth)/auth";
import { formatZodFieldErrors } from "@/lib/agent-skills/format-api-error";
import {
  deleteAgentSkill,
  getAgentSkillById,
  updateAgentSkill,
} from "@/lib/agent-skills/queries";
import {
  updateSkillSchema,
  validateSkillConfig,
} from "@/lib/agent-skills/validation";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
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
  return Response.json({ skill });
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;
  const existing = await getAgentSkillById(session.user.id, id);
  if (!existing) {
    return Response.json({ error: "Skill tidak ditemukan" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = updateSkillSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodFieldErrors(parsed.error.flatten().fieldErrors) },
      { status: 400 }
    );
  }

  const patch = { ...parsed.data };
  if (patch.config && patch.skillType) {
    try {
      patch.config = validateSkillConfig(
        patch.skillType,
        patch.config as Record<string, unknown>
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Konfigurasi skill tidak valid",
        },
        { status: 400 }
      );
    }
  } else if (patch.config) {
    try {
      patch.config = validateSkillConfig(
        existing.skillType,
        patch.config as Record<string, unknown>
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Konfigurasi skill tidak valid",
        },
        { status: 400 }
      );
    }
  }

  if (
    existing.isBuiltin &&
    patch.skillType &&
    patch.skillType !== existing.skillType
  ) {
    return Response.json(
      { error: "Skill bawaan tidak bisa diubah tipenya" },
      { status: 403 }
    );
  }

  const skill = await updateAgentSkill(session.user.id, id, patch);
  return Response.json({ skill });
}

export async function DELETE(request: Request, context: RouteContext) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { id } = await context.params;
  const ok = await deleteAgentSkill(session.user.id, id);
  if (!ok) {
    return Response.json(
      { error: "Skill tidak ditemukan atau skill bawaan tidak bisa dihapus" },
      { status: 404 }
    );
  }
  return Response.json({ ok: true });
}
