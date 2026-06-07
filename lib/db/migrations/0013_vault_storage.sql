CREATE TABLE IF NOT EXISTS "VaultFile" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "fileName" text NOT NULL,
  "fileType" varchar(32) NOT NULL,
  "mimeType" varchar(128) NOT NULL,
  "fileSize" integer NOT NULL,
  "r2Key" text NOT NULL,
  "encrypted" boolean NOT NULL DEFAULT true,
  "encIv" text NOT NULL,
  "encTag" text NOT NULL,
  "summary" text,
  "tags" json DEFAULT '[]'::json,
  "extractedText" text,
  "embedding" vector(1536),
  "storageBackend" varchar(16) NOT NULL DEFAULT 'r2',
  "sourceType" varchar(32) NOT NULL DEFAULT 'upload',
  "sourceChatId" uuid,
  "sourceMessageId" uuid,
  "linkedMemoryId" uuid,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "VaultFile_userId_idx" ON "VaultFile" ("userId");
CREATE INDEX IF NOT EXISTS "VaultFile_userId_createdAt_idx" ON "VaultFile" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "VaultFile_fileType_idx" ON "VaultFile" ("fileType");

CREATE INDEX IF NOT EXISTS "VaultFile_embedding_hnsw_idx"
  ON "VaultFile"
  USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "VaultAuditLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "fileId" uuid REFERENCES "VaultFile"("id") ON DELETE SET NULL,
  "action" varchar(32) NOT NULL,
  "detail" json,
  "ip" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "VaultAuditLog_userId_idx" ON "VaultAuditLog" ("userId");
CREATE INDEX IF NOT EXISTS "VaultAuditLog_fileId_idx" ON "VaultAuditLog" ("fileId");
CREATE INDEX IF NOT EXISTS "VaultAuditLog_createdAt_idx" ON "VaultAuditLog" ("createdAt" DESC);
