CREATE TABLE IF NOT EXISTS "UserNote" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "UserNote_userId_idx" ON "UserNote" ("userId");

CREATE TABLE IF NOT EXISTS "UserTask" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "dueAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "UserTask_userId_idx" ON "UserTask" ("userId");

CREATE TABLE IF NOT EXISTS "ChatSummary" (
  "chatId" uuid PRIMARY KEY NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "messageCount" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "WebSearchCache" (
  "queryHash" text PRIMARY KEY NOT NULL,
  "query" text NOT NULL,
  "results" json NOT NULL,
  "provider" text NOT NULL,
  "fetchedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ResponseCache" (
  "cacheKey" text PRIMARY KEY NOT NULL,
  "response" text NOT NULL,
  "modelId" text NOT NULL,
  "fetchedAt" timestamp DEFAULT now() NOT NULL
);
