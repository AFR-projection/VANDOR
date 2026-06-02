CREATE TABLE IF NOT EXISTS "UserSettings" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "settings" jsonb NOT NULL DEFAULT '{}',
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
