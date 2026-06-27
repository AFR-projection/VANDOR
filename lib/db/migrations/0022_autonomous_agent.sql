-- VANDOR Autonomous (Fase 0) — Digital System Operator core tables

CREATE TABLE IF NOT EXISTS "AgentState" (
  "id" varchar(32) PRIMARY KEY DEFAULT 'default' NOT NULL,
  "mode" varchar(16) DEFAULT 'manual' NOT NULL,
  "killSwitch" boolean DEFAULT false NOT NULL,
  "status" varchar(32) DEFAULT 'idle' NOT NULL,
  "note" text,
  "lastHeartbeatAt" timestamp,
  "lastTickAt" timestamp,
  "tickCount" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

INSERT INTO "AgentState" ("id") VALUES ('default') ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "AgentGoal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid,
  "title" text NOT NULL,
  "description" text,
  "status" varchar(16) DEFAULT 'active' NOT NULL,
  "priority" integer DEFAULT 5 NOT NULL,
  "metadata" json,
  "deadline" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "AgentGoal" ADD CONSTRAINT "AgentGoal_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "AgentTask" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "goalId" uuid,
  "type" varchar(64) NOT NULL,
  "title" text NOT NULL,
  "payload" json,
  "status" varchar(20) DEFAULT 'queued' NOT NULL,
  "priority" integer DEFAULT 5 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "maxAttempts" integer DEFAULT 3 NOT NULL,
  "result" json,
  "error" text,
  "scheduledFor" timestamp,
  "startedAt" timestamp,
  "finishedAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_goalId_AgentGoal_id_fk" FOREIGN KEY ("goalId") REFERENCES "public"."AgentGoal"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AgentTask_status_priority_idx" ON "AgentTask" ("status", "priority" DESC, "createdAt");

CREATE TABLE IF NOT EXISTS "AgentAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "taskId" uuid,
  "approvalId" uuid,
  "tool" varchar(64) NOT NULL,
  "action" varchar(128) NOT NULL,
  "input" json,
  "output" json,
  "status" varchar(16) DEFAULT 'ok' NOT NULL,
  "riskLevel" varchar(16) DEFAULT 'safe' NOT NULL,
  "reason" text,
  "durationMs" integer,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "AgentAction" ADD CONSTRAINT "AgentAction_taskId_AgentTask_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."AgentTask"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AgentAction_createdAt_idx" ON "AgentAction" ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AgentApproval" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "taskId" uuid,
  "actionType" varchar(64) NOT NULL,
  "summary" text NOT NULL,
  "payload" json,
  "riskLevel" varchar(16) DEFAULT 'dangerous' NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "decidedBy" varchar(128),
  "decidedAt" timestamp,
  "expiresAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "AgentApproval" ADD CONSTRAINT "AgentApproval_taskId_AgentTask_id_fk" FOREIGN KEY ("taskId") REFERENCES "public"."AgentTask"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "AgentApproval_status_idx" ON "AgentApproval" ("status", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AgentSchedule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "kind" varchar(16) DEFAULT 'interval' NOT NULL,
  "expression" varchar(128) NOT NULL,
  "taskType" varchar(64) NOT NULL,
  "payload" json,
  "enabled" boolean DEFAULT true NOT NULL,
  "lastRunAt" timestamp,
  "nextRunAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
