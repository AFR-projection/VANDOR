ALTER TABLE "VaultFile" ADD COLUMN IF NOT EXISTS folder text;

CREATE INDEX IF NOT EXISTS "VaultFile_userId_folder_idx"
  ON "VaultFile" ("userId", folder)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "VaultFile_userId_deletedAt_idx"
  ON "VaultFile" ("userId", "deletedAt" DESC)
  WHERE "deletedAt" IS NOT NULL;
