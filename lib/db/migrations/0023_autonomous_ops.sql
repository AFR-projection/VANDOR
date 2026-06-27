-- VANDOR Autonomous (Fase 1-4) — observability, rule engine, notifications

CREATE TABLE IF NOT EXISTS "SystemMetric" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host" varchar(128),
  "cpuPct" integer,
  "memUsedPct" integer,
  "diskUsedPct" integer,
  "load1x100" integer,
  "uptimeSec" integer,
  "payload" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "SystemMetric_createdAt_idx" ON "SystemMetric" ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AgentEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" varchar(64) NOT NULL,
  "severity" varchar(16) DEFAULT 'info' NOT NULL,
  "source" varchar(64) NOT NULL,
  "message" text NOT NULL,
  "payload" json,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "AgentEvent_createdAt_idx" ON "AgentEvent" ("createdAt" DESC);

CREATE TABLE IF NOT EXISTS "AgentRule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(128) NOT NULL,
  "kind" varchar(20) DEFAULT 'deny' NOT NULL,
  "pattern" text NOT NULL,
  "riskLevel" varchar(16) DEFAULT 'dangerous' NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "priority" integer DEFAULT 100 NOT NULL,
  "note" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "AgentNotification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel" varchar(32) DEFAULT 'whatsapp' NOT NULL,
  "level" varchar(16) DEFAULT 'info' NOT NULL,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "status" varchar(16) DEFAULT 'queued' NOT NULL,
  "error" text,
  "sentAt" timestamp,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "AgentNotification_createdAt_idx" ON "AgentNotification" ("createdAt" DESC);
