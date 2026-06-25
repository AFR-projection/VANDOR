import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { getUserSettings, updateUserSettings } from "@/lib/settings/queries";
import { resolveSettingsUserId } from "@/lib/settings/settings-scope";
import { type UserSettings, userSettingsSchema } from "@/lib/settings/types";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const settingsUserId = await resolveSettingsUserId(session.user.id);
  const settings = await getUserSettings(settingsUserId);
  const env = {
    embeddingModel:
      process.env.MEMORY_EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
    postgresConfigured: Boolean(process.env.POSTGRES_URL),
    openrouterConfigured: Boolean(process.env.OPENROUTER_API_KEY),
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

  const settingsUserId = await resolveSettingsUserId(session.user.id);
  const patch = body as Partial<UserSettings>;
  const current = await getUserSettings(settingsUserId);

  const merged: UserSettings = {
    ...current,
    memory: patch.memory
      ? {
          ...current.memory,
          ...patch.memory,
          enabledCategories: {
            ...current.memory.enabledCategories,
            ...patch.memory.enabledCategories,
          },
        }
      : current.memory,
    visualMemory: patch.visualMemory
      ? { ...current.visualMemory, ...patch.visualMemory }
      : current.visualMemory,
    advanced: patch.advanced
      ? { ...current.advanced, ...patch.advanced }
      : current.advanced,
    persona: patch.persona
      ? { ...current.persona, ...patch.persona }
      : current.persona,
    integrations: patch.integrations
      ? { ...current.integrations, ...patch.integrations }
      : current.integrations,
  };

  const validated = userSettingsSchema.parse(merged);
  const saved = await updateUserSettings(settingsUserId, validated);

  return Response.json({ settings: saved });
}
