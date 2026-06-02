CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "UserMemory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "embedding" vector(1536),
  "category" varchar(32) NOT NULL DEFAULT 'fact',
  "importance" integer NOT NULL DEFAULT 5,
  "metadata" json,
  "sourceChatId" uuid,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "UserMemory_userId_idx" ON "UserMemory" ("userId");

CREATE INDEX IF NOT EXISTS "UserMemory_embedding_hnsw_idx"
  ON "UserMemory"
  USING hnsw ("embedding" vector_cosine_ops);
