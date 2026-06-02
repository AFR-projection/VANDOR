import { auth } from "@/app/(auth)/auth";
import { requireClientAccess } from "@/lib/security/client-access";
import { ChatbotError } from "@/lib/errors";
import { getUserSettings, updateUserSettings } from "@/lib/settings/queries";
import { userSettingsSchema, type UserSettings } from "@/lib/settings/types";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const settings = await getUserSettings(session.user.id);
  const env = {
    embeddingModel:
      process.env.MEMORY_EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
    postgresConfigured: Boolean(process.env.POSTGRES_URL),
    openrouterConfigured: Boolean(
      process.env.OPENROUTER_API_KEY
    ),
  };

  return Response.json({ settings, env });
}

export async function PATCH(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  if (!body || typeof body !== "object") {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const patch = body as Partial<UserSettings>;
  const current = await getUserSettings(session.user.id);

  const merged: UserSettings = {
    ...current,
    memory: {
      ...current.memory,
      ...patch.memory,
      enabledCategories: {
        ...current.memory.enabledCategories,
        ...patch.memory?.enabledCategories,
      },
    },
    visualMemory: {
      ...current.visualMemory,
      ...patch.visualMemory,
    },
    advanced: {
      ...current.advanced,
      ...patch.advanced,
    },
    persona: { ...current.persona, ...patch.persona },
    integrations: { ...current.integrations, ...patch.integrations },
  };

  const validated = userSettingsSchema.parse(merged);
  const saved = await updateUserSettings(session.user.id, validated);

  return Response.json({ settings: saved });
}
