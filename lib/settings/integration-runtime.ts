import "server-only";

import { maskSecret } from "@/lib/security/crypto";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import { getExtraSecretsDecrypted } from "@/lib/settings/secrets-queries";
import { getUserSettings } from "@/lib/settings/queries";
import {
  defaultUserSettings,
  type IntegrationsSettings,
} from "@/lib/settings/types";
import type { IntegrationSecretsPayload } from "./integration-secret-keys";

export type SecretSource = "database" | "env" | "none";

export type SecretFieldView = {
  configured: boolean;
  masked: string | null;
  source: SecretSource;
};

export type IntegrationRuntimeConfig = {
  r2: {
    accountId: string | null;
    bucket: string | null;
    publicUrl: string | null;
    accessKeyId: string | null;
    secretAccessKey: string | null;
    configured: boolean;
    accessKeySource: SecretSource;
    secretKeySource: SecretSource;
  };
  cobalt: {
    apiUrl: string | null;
    apiKey: string | null;
    allowPublic: boolean;
    configured: boolean;
    apiKeySource: SecretSource;
  };
  openweathermap: {
    apiKey: string | null;
    configured: boolean;
    source: SecretSource;
  };
  vercelBlob: {
    token: string | null;
    configured: boolean;
    source: SecretSource;
  };
  whatsappBridge: {
    secret: string | null;
    configured: boolean;
    source: SecretSource;
  };
};

let cache: { at: number; config: IntegrationRuntimeConfig } | null = null;
const CACHE_TTL_MS = 10_000;

export function invalidateIntegrationRuntimeCache(): void {
  cache = null;
}

function pickSecret(
  dbValue: string | undefined,
  envValue: string | undefined
): { value: string | null; source: SecretSource } {
  const fromDb = dbValue?.trim();
  if (fromDb) {
    return { value: fromDb, source: "database" };
  }
  const fromEnv = envValue?.trim();
  if (fromEnv) {
    return { value: fromEnv, source: "env" };
  }
  return { value: null, source: "none" };
}

function pickConfig(
  dbValue: string | undefined,
  envValue: string | undefined
): string | null {
  const fromDb = dbValue?.trim();
  if (fromDb) {
    return fromDb;
  }
  const fromEnv = envValue?.trim();
  return fromEnv || null;
}

function buildRuntimeConfig(
  integrations: IntegrationsSettings,
  extra: IntegrationSecretsPayload
): IntegrationRuntimeConfig {
  const r2Access = pickSecret(
    extra.r2AccessKeyId,
    process.env.R2_ACCESS_KEY_ID
  );
  const r2Secret = pickSecret(
    extra.r2SecretAccessKey,
    process.env.R2_SECRET_ACCESS_KEY
  );
  const r2AccountId = pickSecret(
    extra.r2AccountId ??
      (integrations.r2AccountId.trim() || undefined),
    process.env.R2_ACCOUNT_ID
  );
  const r2Bucket = pickSecret(
    extra.r2BucketName ??
      (integrations.r2BucketName.trim() || undefined),
    process.env.R2_BUCKET_NAME
  );
  const r2PublicUrl = pickConfig(
    integrations.r2PublicUrl,
    process.env.R2_PUBLIC_URL
  );

  const cobaltKey = pickSecret(extra.cobaltApiKey, process.env.COBALT_API_KEY);
  const cobaltUrl = pickConfig(
    integrations.cobaltApiUrl,
    process.env.COBALT_API_URL
  );
  const cobaltAllowPublic =
    integrations.cobaltAllowPublic ||
    process.env.COBALT_ALLOW_PUBLIC === "1";

  const owm = pickSecret(
    extra.openweathermapApiKey,
    process.env.OPENWEATHERMAP_API_KEY
  );
  const blob = pickSecret(
    extra.blobReadWriteToken,
    process.env.BLOB_READ_WRITE_TOKEN
  );
  const bridge = pickSecret(
    extra.whatsappBridgeSecret,
    process.env.WHATSAPP_BRIDGE_SECRET
  );

  const r2Configured = Boolean(
    r2AccountId.value &&
      r2Bucket.value &&
      r2Access.value &&
      r2Secret.value
  );

  const cobaltConfigured = Boolean(
    cobaltAllowPublic || cobaltUrl || cobaltKey.value
  );

  return {
    r2: {
      accountId: r2AccountId.value,
      bucket: r2Bucket.value,
      publicUrl: r2PublicUrl,
      accessKeyId: r2Access.value,
      secretAccessKey: r2Secret.value,
      configured: r2Configured,
      accessKeySource: r2Access.source,
      secretKeySource: r2Secret.source,
    },
    cobalt: {
      apiUrl: cobaltUrl,
      apiKey: cobaltKey.value,
      allowPublic: cobaltAllowPublic,
      configured: cobaltConfigured,
      apiKeySource: cobaltKey.source,
    },
    openweathermap: {
      apiKey: owm.value,
      configured: Boolean(owm.value),
      source: owm.source,
    },
    vercelBlob: {
      token: blob.value,
      configured: Boolean(blob.value),
      source: blob.source,
    },
    whatsappBridge: {
      secret: bridge.value,
      configured: Boolean(bridge.value && bridge.value.length >= 8),
      source: bridge.source,
    },
  };
}

export async function getIntegrationRuntimeConfig(): Promise<IntegrationRuntimeConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.config;
  }

  const owner = await resolveDeploymentOwnerUser();
  let integrations = defaultUserSettings.integrations;
  let extra: IntegrationSecretsPayload = {};

  if (owner) {
    const settings = await getUserSettings(owner.id);
    integrations = settings.integrations;
    extra = await getExtraSecretsDecrypted(owner.id);
  }

  const config = buildRuntimeConfig(integrations, extra);
  cache = { at: Date.now(), config };
  return config;
}

export function secretFieldView(
  value: string | null,
  source: SecretSource
): SecretFieldView {
  return {
    configured: source !== "none" && Boolean(value),
    masked: value ? maskSecret(value) : null,
    source,
  };
}

export async function getMemoryEmbeddingModelForRuntime(): Promise<string> {
  const owner = await resolveDeploymentOwnerUser();
  if (owner) {
    const settings = await getUserSettings(owner.id);
    const fromUi = settings.integrations.memoryEmbeddingModel?.trim();
    if (fromUi) {
      return fromUi;
    }
  }
  return (
    process.env.MEMORY_EMBEDDING_MODEL?.trim() ||
    "openai/text-embedding-3-small"
  );
}
