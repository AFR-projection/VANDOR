import { DEFAULT_MODEL_TIER } from "@/lib/ai/model-tiers";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { requireClientAccess } from "@/lib/security/client-access";
import { GATE_PIN_LENGTH } from "@/lib/security/gate-edge";
import { revokeAllGateSessions } from "@/lib/security/gate";
import { verifyNumpadPinForGate } from "@/lib/security/pin-gate";
import { ChatbotError } from "@/lib/errors";
import { getUserSettings, updateUserSettings } from "@/lib/settings/queries";
import {
  getSecretsPublicView,
  updateUserSecrets,
} from "@/lib/settings/secrets-queries";
import {
  integrationsSettingsSchema,
  personaSettingsSchema,
  type UserSettings,
} from "@/lib/settings/types";

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

  const [secrets, settings] = await Promise.all([
    getSecretsPublicView(session.user.id),
    getUserSettings(session.user.id),
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

  const data = parsed.data;
  const {
    currentPin,
    newPin,
    openrouterApiKey,
    tavilyApiKey,
    clearOpenrouter,
    clearTavily,
    persona,
    integrations,
  } = data;

  const hasSecretsChange =
    newPin ||
    openrouterApiKey ||
    tavilyApiKey ||
    clearOpenrouter ||
    clearTavily;

  const hasSettingsChange = Boolean(persona || integrations);

  if (!hasSecretsChange && !hasSettingsChange) {
    return Response.json({ error: "Tidak ada perubahan" }, { status: 400 });
  }

  if (hasSecretsChange) {
    if (!currentPin || !(await verifyNumpadPinForGate(currentPin))) {
      return Response.json({ error: "PIN saat ini salah" }, { status: 401 });
    }

    await updateUserSecrets({
      userId: session.user.id,
      newPin: newPin ?? undefined,
      openrouterApiKey,
      tavilyApiKey,
      clearOpenrouter,
      clearTavily,
    });

    if (newPin) {
      await revokeAllGateSessions();
    }
  }

  let savedSettings: UserSettings | null = null;
  if (hasSettingsChange) {
    const current = await getUserSettings(session.user.id);
    const merged: Partial<UserSettings> = {
      persona: persona ? { ...current.persona, ...persona } : undefined,
      integrations: integrations
        ? { ...current.integrations, ...integrations }
        : undefined,
    };
    savedSettings = await updateUserSettings(session.user.id, merged);
  }

  const secrets = await getSecretsPublicView(session.user.id);
  const settings =
    savedSettings ?? (await getUserSettings(session.user.id));

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
