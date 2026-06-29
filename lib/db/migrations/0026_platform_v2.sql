-- Multi-Agent Platform V2 (Fase 0) — workflow engine + event bus

CREATE TABLE IF NOT EXISTS "PlatformWorkflowRun" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL,
  "chatId" uuid,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "planJson" json,
  "inputSummary" text,
  "outputSummary" text,
  "totalTokens" integer DEFAULT 0 NOT NULL,
  "totalCostMicroUsd" integer DEFAULT 0 NOT NULL,
  "error" text,
  "startedAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "PlatformWorkflowRun" ADD CONSTRAINT "PlatformWorkflowRun_userId_User_id_fk"
   FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "PlatformWorkflowRun" ADD CONSTRAINT "PlatformWorkflowRun_chatId_Chat_id_fk"
   FOREIGN KEY ("chatId") REFERENCES "public"."Chat"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "PlatformWorkflowRun_user_status_idx"
  ON "PlatformWorkflowRun" ("userId", "status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "PlatformWorkflowStep" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "runId" uuid NOT NULL,
  "agentId" varchar(64) NOT NULL,
  "stepKey" varchar(64) NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "input" json,
  "output" json,
  "attempt" integer DEFAULT 0 NOT NULL,
  "maxAttempts" integer DEFAULT 3 NOT NULL,
  "parentStepId" uuid,
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "error" text,
  "startedAt" timestamp,
  "completedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "PlatformWorkflowStep" ADD CONSTRAINT "PlatformWorkflowStep_runId_PlatformWorkflowRun_id_fk"
   FOREIGN KEY ("runId") REFERENCES "public"."PlatformWorkflowRun"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformWorkflowStep_run_step_key_idx"
  ON "PlatformWorkflowStep" ("runId", "stepKey");

CREATE INDEX IF NOT EXISTS "PlatformWorkflowStep_run_status_order_idx"
  ON "PlatformWorkflowStep" ("runId", "status", "sortOrder");

CREATE TABLE IF NOT EXISTS "PlatformEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "runId" uuid,
  "stepId" uuid,
  "topic" varchar(64) NOT NULL,
  "agentId" varchar(64),
  "payload" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_runId_PlatformWorkflowRun_id_fk"
   FOREIGN KEY ("runId") REFERENCES "public"."PlatformWorkflowRun"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "PlatformEvent" ADD CONSTRAINT "PlatformEvent_stepId_PlatformWorkflowStep_id_fk"
   FOREIGN KEY ("stepId") REFERENCES "public"."PlatformWorkflowStep"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "PlatformEvent_run_created_idx"
  ON "PlatformEvent" ("runId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "PlatformAgentRunLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "stepId" uuid NOT NULL,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text NOT NULL,
  "metadata" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "PlatformAgentRunLog" ADD CONSTRAINT "PlatformAgentRunLog_stepId_PlatformWorkflowStep_id_fk"
   FOREIGN KEY ("stepId") REFERENCES "public"."PlatformWorkflowStep"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "PlatformAgentRunLog_step_created_idx"
  ON "PlatformAgentRunLog" ("stepId", "createdAt" DESC);

-- Link legacy worker queue ke platform workflow (opsional, nullable)
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "workflowRunId" uuid;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "workflowStepId" uuid;

DO $$ BEGIN
 ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workflowRunId_PlatformWorkflowRun_id_fk"
   FOREIGN KEY ("workflowRunId") REFERENCES "public"."PlatformWorkflowRun"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_workflowStepId_PlatformWorkflowStep_id_fk"
   FOREIGN KEY ("workflowStepId") REFERENCES "public"."PlatformWorkflowStep"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AgentTask_workflow_run_idx"
  ON "AgentTask" ("workflowRunId") WHERE "workflowRunId" IS NOT NULL;
