import { auth } from "@/app/(auth)/auth";
import {
  resolveIntegrationModels,
  resolveTierFromSettings,
} from "@/lib/ai/integration-models";
import { DEFAULT_MODEL_TIER, slotsFromTier } from "@/lib/ai/model-tiers";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { getUserSettings } from "@/lib/settings/queries";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const settings = await getUserSettings(session.user.id);
  const tier = resolveTierFromSettings(settings.integrations);
  const models = resolveIntegrationModels(settings.integrations);

  return Response.json(
    {
      modelTier: tier,
      chatModel: models.chatModel,
      freeModel1: models.freeModel1,
      presets: slotsFromTier(tier),
      defaults: { modelTier: DEFAULT_MODEL_TIER },
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
