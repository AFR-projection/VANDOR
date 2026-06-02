CREATE TABLE IF NOT EXISTS "Persona" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "kind" varchar NOT NULL DEFAULT 'custom',
  "systemPrompt" text NOT NULL,
  "voice" json NOT NULL,
  "style" json,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "Persona_userId_idx" ON "Persona" ("userId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "CallSession" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "chatId" uuid REFERENCES "Chat"("id"),
  "mode" varchar NOT NULL,
  "personaId" text,
  "modelId" text NOT NULL,
  "startedAt" timestamp DEFAULT now() NOT NULL,
  "endedAt" timestamp,
  "metrics" json
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CallSession_userId_idx" ON "CallSession" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CallSession_chatId_idx" ON "CallSession" ("chatId");
