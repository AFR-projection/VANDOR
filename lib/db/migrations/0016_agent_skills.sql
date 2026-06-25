-- Agent Skills / Tools system

CREATE TABLE IF NOT EXISTS "AgentSkill" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "slug" varchar(64) NOT NULL,
  "name" text NOT NULL,
  "description" text NOT NULL,
  "category" varchar(32) NOT NULL DEFAULT 'api',
  "skillType" varchar(32) NOT NULL DEFAULT 'http_api',
  "config" json NOT NULL DEFAULT '{}',
  "isActive" boolean NOT NULL DEFAULT true,
  "isBuiltin" boolean NOT NULL DEFAULT false,
  "rateLimitPerHour" integer NOT NULL DEFAULT 120,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "AgentSkill_userId_slug_idx" ON "AgentSkill" ("userId", "slug");
CREATE INDEX IF NOT EXISTS "AgentSkill_userId_isActive_idx" ON "AgentSkill" ("userId", "isActive");

DO $$ BEGIN
 ALTER TABLE "AgentSkill" ADD CONSTRAINT "AgentSkill_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AgentSkillApiKey" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "name" varchar(128) NOT NULL,
  "keyEnc" text NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentSkillApiKey_userId_idx" ON "AgentSkillApiKey" ("userId");

DO $$ BEGIN
 ALTER TABLE "AgentSkillApiKey" ADD CONSTRAINT "AgentSkillApiKey_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AgentSkillLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "chatId" uuid,
  "skillId" uuid,
  "skillSlug" varchar(64) NOT NULL,
  "skillName" text NOT NULL,
  "request" json,
  "response" json,
  "executionTimeMs" integer,
  "status" varchar(16) NOT NULL DEFAULT 'ok',
  "errorMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "AgentSkillLog_userId_createdAt_idx" ON "AgentSkillLog" ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "AgentSkillLog_skillId_idx" ON "AgentSkillLog" ("skillId");

DO $$ BEGIN
 ALTER TABLE "AgentSkillLog" ADD CONSTRAINT "AgentSkillLog_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "AgentSkillLog" ADD CONSTRAINT "AgentSkillLog_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "AgentSkillLog" ADD CONSTRAINT "AgentSkillLog_skillId_AgentSkill_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."AgentSkill"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeBaseDocument" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "skillId" uuid,
  "fileName" text NOT NULL,
  "mimeType" varchar(128) NOT NULL,
  "fileSize" integer NOT NULL DEFAULT 0,
  "extractedText" text,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "chunkCount" integer NOT NULL DEFAULT 0,
  "errorMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "KnowledgeBaseDocument_userId_idx" ON "KnowledgeBaseDocument" ("userId", "createdAt" DESC);

DO $$ BEGIN
 ALTER TABLE "KnowledgeBaseDocument" ADD CONSTRAINT "KnowledgeBaseDocument_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "KnowledgeBaseDocument" ADD CONSTRAINT "KnowledgeBaseDocument_skillId_AgentSkill_id_fk" FOREIGN KEY ("skillId") REFERENCES "public"."AgentSkill"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "KnowledgeBaseChunk" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "documentId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "chunkIndex" integer NOT NULL,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "KnowledgeBaseChunk_documentId_idx" ON "KnowledgeBaseChunk" ("documentId");
CREATE INDEX IF NOT EXISTS "KnowledgeBaseChunk_userId_idx" ON "KnowledgeBaseChunk" ("userId");

DO $$ BEGIN
 ALTER TABLE "KnowledgeBaseChunk" ADD CONSTRAINT "KnowledgeBaseChunk_documentId_KnowledgeBaseDocument_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."KnowledgeBaseDocument"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "KnowledgeBaseChunk" ADD CONSTRAINT "KnowledgeBaseChunk_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "KnowledgeBaseChunk_embedding_hnsw_idx"
  ON "KnowledgeBaseChunk" USING hnsw ("embedding" vector_cosine_ops);
