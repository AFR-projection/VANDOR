CREATE TABLE IF NOT EXISTS "ToolEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "chatId" uuid,
  "toolName" varchar(64) NOT NULL,
  "status" varchar(16) NOT NULL,
  "durationMs" integer,
  "detail" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "ToolEvent_userId_createdAt_idx" ON "ToolEvent" ("userId", "createdAt" DESC);

DO $$ BEGIN
 ALTER TABLE "ToolEvent" ADD CONSTRAINT "ToolEvent_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "ToolEvent" ADD CONSTRAINT "ToolEvent_chatId_Chat_id_fk" FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
