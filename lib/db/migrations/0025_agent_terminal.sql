CREATE TABLE IF NOT EXISTS "AgentTerminalLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sessionId" uuid NOT NULL,
  "stream" varchar(32) DEFAULT 'cli' NOT NULL,
  "line" text NOT NULL,
  "level" varchar(16) DEFAULT 'stdout' NOT NULL,
  "command" text,
  "exitCode" integer,
  "taskId" uuid,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "AgentTerminalLog"
    ADD CONSTRAINT "AgentTerminalLog_taskId_AgentTask_id_fk"
    FOREIGN KEY ("taskId") REFERENCES "public"."AgentTask"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AgentTerminalLog_sessionId_idx"
  ON "AgentTerminalLog" ("sessionId");

CREATE INDEX IF NOT EXISTS "AgentTerminalLog_createdAt_idx"
  ON "AgentTerminalLog" ("createdAt" DESC);
