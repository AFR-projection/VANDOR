ALTER TABLE "VaultFile" ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE "VaultFile" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;

CREATE INDEX IF NOT EXISTS "VaultFile_userId_pinned_idx"
  ON "VaultFile" ("userId", pinned DESC, "updatedAt" DESC)
  WHERE "deletedAt" IS NULL;
