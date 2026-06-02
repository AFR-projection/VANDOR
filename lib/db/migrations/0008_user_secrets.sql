CREATE TABLE IF NOT EXISTS "UserSecrets" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "openrouterApiKeyEnc" text,
  "tavilyApiKeyEnc" text,
  "numpadPinHash" text,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
