export const INTEGRATION_SECRET_KEYS = [
  "r2AccountId",
  "r2BucketName",
  "r2AccessKeyId",
  "r2SecretAccessKey",
  "cobaltApiKey",
  "openweathermapApiKey",
  "apiFootballApiKey",
  "whatsappBridgeSecret",
  "blobReadWriteToken",
] as const;

export type IntegrationSecretKey = (typeof INTEGRATION_SECRET_KEYS)[number];

export type IntegrationSecretsPayload = Partial<
  Record<IntegrationSecretKey, string>
>;

export function isIntegrationSecretKey(
  value: string
): value is IntegrationSecretKey {
  return (INTEGRATION_SECRET_KEYS as readonly string[]).includes(value);
}
