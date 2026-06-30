import { auth } from "@/app/(auth)/auth";
import { formatZodFieldErrors } from "@/lib/agent-skills/format-api-error";
import {
  createAgentSkill,
  listAgentSkills,
  listApiKeys,
} from "@/lib/agent-skills/queries";
import { ensureBuiltinSkills } from "@/lib/agent-skills/seed";
import {
  createSkillSchema,
  validateSkillConfig,
} from "@/lib/agent-skills/validation";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { resolveSettingsUserId } from "@/lib/settings/settings-scope";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  try {
    const settingsUserId = await resolveSettingsUserId(session.user.id);
    await ensureBuiltinSkills(settingsUserId);
    const [skills, apiKeys] = await Promise.all([
      listAgentSkills(settingsUserId),
      listApiKeys(settingsUserId),
    ]);
    return Response.json({ skills, apiKeys });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Gagal memuat agent skills",
      },
      { status: 503 }
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const parsed = createSkillSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: formatZodFieldErrors(parsed.error.flatten().fieldErrors) },
      { status: 400 }
    );
  }

  let config: Record<string, unknown>;
  try {
    config = validateSkillConfig(parsed.data.skillType, parsed.data.config);
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

  const settingsUserId = await resolveSettingsUserId(session.user.id);

  const skill = await createAgentSkill({
    userId: settingsUserId,
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description,
    category: parsed.data.category,
    skillType: parsed.data.skillType,
    config,
    isActive: parsed.data.isActive,
    rateLimitPerHour: parsed.data.rateLimitPerHour,
  });

  return Response.json({ skill }, { status: 201 });
}
