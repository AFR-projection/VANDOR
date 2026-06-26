export type SecretSource = "database" | "env" | "none";

export type SecretFieldView = {
  configured: boolean;
  masked: string | null;
  source: SecretSource;
};

export type SecretsPublicView = {
  openrouter: SecretFieldView;
  tavily: SecretFieldView;
  pin: { configured: boolean; source: SecretSource };
  r2AccountId: SecretFieldView;
  r2BucketName: SecretFieldView;
  r2AccessKeyId: SecretFieldView;
  r2SecretAccessKey: SecretFieldView;
  cobaltApiKey: SecretFieldView;
  openweathermapApiKey: SecretFieldView;
  whatsappBridgeSecret: SecretFieldView;
  blobReadWriteToken: SecretFieldView;
  storage: {
    r2Configured: boolean;
    vercelBlobConfigured: boolean;
    cobaltConfigured: boolean;
  };
};
