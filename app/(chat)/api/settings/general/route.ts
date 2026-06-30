import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { DEFAULT_MODEL_TIER } from "@/lib/ai/model-tiers";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { revokeAllGateSessions } from "@/lib/security/gate";
import { GATE_PIN_LENGTH } from "@/lib/security/gate-edge";
import { verifyNumpadPinForGate } from "@/lib/security/pin-gate";
import { INTEGRATION_SECRET_KEYS } from "@/lib/settings/integration-secret-keys";
import type { IntegrationSecretKey } from "@/lib/settings/integration-secret-keys";
import { invalidateIntegrationRuntimeCache } from "@/lib/settings/integration-runtime";
import { getUserSettings, updateUserSettings } from "@/lib/settings/queries";
import { resolveSettingsUserId } from "@/lib/settings/settings-scope";
import {
  getSecretsPublicView,
  updateUserSecrets,
} from "@/lib/settings/secrets-queries";
import {
  integrationsSettingsSchema,
  personaSettingsSchema,
  type UserSettings,
} from "@/lib/settings/types";

const extraSecretsPatchSchema = z
  .object({
    r2AccountId: z.string().min(4).optional(),
    r2BucketName: z.string().min(1).optional(),
    r2AccessKeyId: z.string().min(4).optional(),
    r2SecretAccessKey: z.string().min(8).optional(),
    cobaltApiKey: z.string().min(4).optional(),
    openweathermapApiKey: z.string().min(8).optional(),
    apiFootballApiKey: z.string().min(16).optional(),
    whatsappBridgeSecret: z.string().min(8).optional(),
    blobReadWriteToken: z.string().min(10).optional(),
  })
  .partial();

const secretsPatchSchema = z.object({
  currentPin: z
    .string()
    .regex(/^\d{4}$/, `PIN harus ${GATE_PIN_LENGTH} digit`)
    .optional(),
  newPin: z
    .string()
    .regex(/^\d{4}$/, `PIN baru harus ${GATE_PIN_LENGTH} digit`)
    .optional(),
  openrouterApiKey: z.string().min(10).optional(),
  tavilyApiKey: z.string().min(8).optional(),
  clearOpenrouter: z.boolean().optional(),
  clearTavily: z.boolean().optional(),
  extraSecrets: extraSecretsPatchSchema.optional(),
  clearExtraSecrets: z
    .array(z.enum(INTEGRATION_SECRET_KEYS))
    .optional(),
});

const settingsPatchSchema = z.object({
  persona: personaSettingsSchema.partial().optional(),
  integrations: integrationsSettingsSchema.partial().optional(),
});

const patchSchema = secretsPatchSchema.merge(settingsPatchSchema);

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const settingsUserId = await resolveSettingsUserId(session.user.id);

  const [secrets, settings] = await Promise.all([
    getSecretsPublicView(settingsUserId),
    getUserSettings(settingsUserId),
  ]);

  return Response.json({
    secrets,
    settings: {
      persona: settings.persona,
      integrations: settings.integrations,
    },
    gate: {
      ttlSeconds: Number(process.env.VANDOR_GATE_TTL_SECONDS ?? "2592000"),
    },
    envRequired: {
      postgres: Boolean(process.env.POSTGRES_URL),
      authSecret: Boolean(process.env.AUTH_SECRET),
      ownerEmail: Boolean(process.env.VANDOR_OWNER_EMAIL),
    },
    defaultModelTier: DEFAULT_MODEL_TIER,
  });
}

export async function PATCH(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const settingsUserId = await resolveSettingsUserId(session.user.id);

  const data = parsed.data;
  const {
    currentPin,
    newPin,
    openrouterApiKey,
    tavilyApiKey,
    clearOpenrouter,
    clearTavily,
    extraSecrets,
    clearExtraSecrets,
    persona,
    integrations,
  } = data;

  const hasSecretsChange =
    newPin ||
    openrouterApiKey ||
    tavilyApiKey ||
    clearOpenrouter ||
    clearTavily ||
    (extraSecrets && Object.keys(extraSecrets).length > 0) ||
    (clearExtraSecrets && clearExtraSecrets.length > 0);

  const hasSettingsChange = Boolean(persona || integrations);

  if (!hasSecretsChange && !hasSettingsChange) {
    return Response.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  if (hasSecretsChange) {
    if (!currentPin || !(await verifyNumpadPinForGate(currentPin))) {
      return Response.json({ error: "PIN saat ini salah" }, { status: 401 });
    }

    await updateUserSecrets({
      userId: settingsUserId,
      newPin: newPin ?? undefined,
      openrouterApiKey,
      tavilyApiKey,
      clearOpenrouter,
      clearTavily,
      extraSecrets,
      clearExtraSecrets: clearExtraSecrets as IntegrationSecretKey[] | undefined,
    });

    if (newPin) {
      await revokeAllGateSessions();
    }
  }

  let savedSettings: UserSettings | null = null;
  if (hasSettingsChange) {
    const current = await getUserSettings(settingsUserId);
    const patch: Partial<UserSettings> = {};
    if (persona) {
      patch.persona = { ...current.persona, ...persona };
    }
    if (integrations) {
      patch.integrations = { ...current.integrations, ...integrations };
    }
    savedSettings = await updateUserSettings(settingsUserId, patch);
    invalidateIntegrationRuntimeCache();
  }

  const secrets = await getSecretsPublicView(settingsUserId);
  const settings =
    savedSettings ?? (await getUserSettings(settingsUserId));

  return Response.json({
    ok: true,
    secrets,
    settings: {
      persona: settings.persona,
      integrations: settings.integrations,
    },
    message: newPin
      ? "PIN baru disimpan. Semua perangkat harus login ulang dengan PIN baru."
      : hasSecretsChange
        ? "API & PIN disimpan (terenkripsi di database)."
        : "Gaya bicara & integrasi disimpan.",
  });
}
