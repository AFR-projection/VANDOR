import "server-only";

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { userSecrets } from "@/lib/db/schema";
import {
  decryptSecret,
  encryptSecret,
  maskSecret,
} from "@/lib/security/crypto";
import { hashNumpadPin } from "@/lib/security/pin-hash";
import {
  type IntegrationSecretKey,
  type IntegrationSecretsPayload,
  isIntegrationSecretKey,
} from "@/lib/settings/integration-secret-keys";
import { invalidateIntegrationRuntimeCache } from "@/lib/settings/integration-runtime";
import { getUserSettings } from "@/lib/settings/queries";
import type {
  SecretFieldView,
  SecretsPublicView,
  SecretSource,
} from "@/lib/settings/secrets-types";

export type { SecretFieldView, SecretsPublicView, SecretSource };

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

async function getRow(userId: string) {
  const rows = await db
    .select()
    .from(userSecrets)
    .where(eq(userSecrets.userId, userId))
    .limit(1);
  return rows.at(0) ?? null;
}

function readExtraSecretsEnc(payload: string | null | undefined): IntegrationSecretsPayload {
  if (!payload) {
    return {};
  }
  const dec = decryptSecret(payload);
  if (!dec) {
    return {};
  }
  try {
    const parsed = JSON.parse(dec) as Record<string, unknown>;
    const out: IntegrationSecretsPayload = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isIntegrationSecretKey(key) && typeof value === "string" && value.trim()) {
        out[key] = value.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeExtraSecretsEnc(payload: IntegrationSecretsPayload): string {
  return encryptSecret(JSON.stringify(payload));
}

function secretFieldFromValues(
  dbValue: string | undefined,
  envValue: string | undefined
): SecretFieldView {
  const fromDb = dbValue?.trim();
  if (fromDb) {
    return {
      configured: true,
      masked: maskSecret(fromDb),
      source: "database",
    };
  }
  const fromEnv = envValue?.trim();
  if (fromEnv) {
    return {
      configured: true,
      masked: maskSecret(fromEnv),
      source: "env",
    };
  }
  return { configured: false, masked: null, source: "none" };
}
export async function getExtraSecretsDecrypted(
  userId: string
): Promise<IntegrationSecretsPayload> {
  const row = await getRow(userId);
  return readExtraSecretsEnc(row?.extraSecretsEnc);
}

export async function getOpenRouterApiKey(
  userId: string
): Promise<string | null> {
  const row = await getRow(userId);
  if (row?.openrouterApiKeyEnc) {
    const dec = decryptSecret(row.openrouterApiKeyEnc);
    if (dec) {
      return dec;
    }
  }
  return process.env.OPENROUTER_API_KEY?.trim() || null;
}

export async function getTavilyApiKey(userId: string): Promise<string | null> {
  const row = await getRow(userId);
  if (row?.tavilyApiKeyEnc) {
    const dec = decryptSecret(row.tavilyApiKeyEnc);
    if (dec) {
      return dec;
    }
  }
  return process.env.TAVILY_API_KEY?.trim() || null;
}

export async function getNumpadPinHash(userId: string): Promise<string | null> {
  const row = await getRow(userId);
  return row?.numpadPinHash ?? null;
}

export async function getSecretsPublicView(
  userId: string
): Promise<SecretsPublicView> {
  const [settings, extraRow] = await Promise.all([
    getUserSettings(userId),
    getRow(userId),
  ]);
  const row = extraRow;
  const extra = readExtraSecretsEnc(row?.extraSecretsEnc);
  const int = settings.integrations;
  const envOr = process.env.OPENROUTER_API_KEY?.trim();
  const envTavily = process.env.TAVILY_API_KEY?.trim();
  const envPin = process.env.VANDOR_NUMPAD_PIN?.trim();

  let orSource: SecretSource = "none";
  let orMasked: string | null = null;
  if (row?.openrouterApiKeyEnc) {
    const dec = decryptSecret(row.openrouterApiKeyEnc);
    if (dec) {
      orSource = "database";
      orMasked = maskSecret(dec);
    }
  } else if (envOr) {
    orSource = "env";
    orMasked = maskSecret(envOr);
  }

  let tavSource: SecretSource = "none";
  let tavMasked: string | null = null;
  if (row?.tavilyApiKeyEnc) {
    const dec = decryptSecret(row.tavilyApiKeyEnc);
    if (dec) {
      tavSource = "database";
      tavMasked = maskSecret(dec);
    }
  } else if (envTavily) {
    tavSource = "env";
    tavMasked = maskSecret(envTavily);
  }

  let pinSource: SecretSource = "none";
  if (row?.numpadPinHash) {
    pinSource = "database";
  } else if (envPin) {
    pinSource = "env";
  }

  const r2Account = secretFieldFromValues(
    extra.r2AccountId ?? int.r2AccountId,
    process.env.R2_ACCOUNT_ID
  );
  const r2BucketName = secretFieldFromValues(
    extra.r2BucketName ?? int.r2BucketName,
    process.env.R2_BUCKET_NAME
  );
  const cobaltUrl =
    int.cobaltApiUrl.trim() || process.env.COBALT_API_URL?.trim() || "";

  const r2Access = secretFieldFromValues(
    extra.r2AccessKeyId,
    process.env.R2_ACCESS_KEY_ID
  );
  const r2Secret = secretFieldFromValues(
    extra.r2SecretAccessKey,
    process.env.R2_SECRET_ACCESS_KEY
  );
  const cobaltKey = secretFieldFromValues(
    extra.cobaltApiKey,
    process.env.COBALT_API_KEY
  );
  const owm = secretFieldFromValues(
    extra.openweathermapApiKey,
    process.env.OPENWEATHERMAP_API_KEY
  );
  const bridge = secretFieldFromValues(
    extra.whatsappBridgeSecret,
    process.env.WHATSAPP_BRIDGE_SECRET
  );
  const blob = secretFieldFromValues(
    extra.blobReadWriteToken,
    process.env.BLOB_READ_WRITE_TOKEN
  );

  const r2Configured = Boolean(
    r2Account.configured &&
      r2BucketName.configured &&
      r2Access.configured &&
      r2Secret.configured
  );

  return {
    openrouter: {
      configured: orSource !== "none",
      masked: orMasked,
      source: orSource,
    },
    tavily: {
      configured: tavSource !== "none",
      masked: tavMasked,
      source: tavSource,
    },
    pin: {
      configured: pinSource !== "none",
      source: pinSource,
    },
    r2AccountId: r2Account,
    r2BucketName,
    r2AccessKeyId: r2Access,
    r2SecretAccessKey: r2Secret,
    cobaltApiKey: cobaltKey,
    openweathermapApiKey: owm,
    whatsappBridgeSecret: bridge,
    blobReadWriteToken: blob,
    storage: {
      r2Configured,
      vercelBlobConfigured: blob.configured,
      cobaltConfigured: Boolean(
        cobaltKey.configured ||
          cobaltUrl ||
          int.cobaltAllowPublic ||
          process.env.COBALT_ALLOW_PUBLIC === "1"
      ),
    },
  };
}

export async function updateUserSecrets({
  userId,
  openrouterApiKey,
  tavilyApiKey,
  clearOpenrouter,
  clearTavily,
  newPin,
  extraSecrets,
  clearExtraSecrets,
}: {
  userId: string;
  openrouterApiKey?: string;
  tavilyApiKey?: string;
  clearOpenrouter?: boolean;
  clearTavily?: boolean;
  newPin?: string;
  extraSecrets?: IntegrationSecretsPayload;
  clearExtraSecrets?: IntegrationSecretKey[];
}): Promise<void> {
  const existing = await getRow(userId);
  const currentExtra = readExtraSecretsEnc(existing?.extraSecretsEnc);

  const openrouterApiKeyEnc = clearOpenrouter
    ? null
    : openrouterApiKey?.trim()
      ? encryptSecret(openrouterApiKey.trim())
      : (existing?.openrouterApiKeyEnc ?? null);

  const tavilyApiKeyEnc = clearTavily
    ? null
    : tavilyApiKey?.trim()
      ? encryptSecret(tavilyApiKey.trim())
      : (existing?.tavilyApiKeyEnc ?? null);

  const numpadPinHash = newPin
    ? hashNumpadPin(newPin)
    : (existing?.numpadPinHash ?? null);

  const mergedExtra: IntegrationSecretsPayload = { ...currentExtra };

  if (extraSecrets) {
    for (const [key, value] of Object.entries(extraSecrets)) {
      if (!isIntegrationSecretKey(key)) {
        continue;
      }
      const trimmed = value?.trim();
      if (trimmed) {
        mergedExtra[key] = trimmed;
      }
    }
  }

  if (clearExtraSecrets?.length) {
    for (const key of clearExtraSecrets) {
      delete mergedExtra[key];
    }
  }

  const extraSecretsEnc =
    Object.keys(mergedExtra).length > 0
      ? writeExtraSecretsEnc(mergedExtra)
      : clearExtraSecrets?.length
        ? null
        : (existing?.extraSecretsEnc ?? null);

  await db
    .insert(userSecrets)
    .values({
      userId,
      openrouterApiKeyEnc,
      tavilyApiKeyEnc,
      numpadPinHash,
      extraSecretsEnc,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userSecrets.userId,
      set: {
        openrouterApiKeyEnc,
        tavilyApiKeyEnc,
        numpadPinHash,
        extraSecretsEnc,
        updatedAt: new Date(),
      },
    });

  invalidateIntegrationRuntimeCache();
}
