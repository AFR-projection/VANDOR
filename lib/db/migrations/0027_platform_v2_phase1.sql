-- Multi-Agent Platform V2 Phase 1 — idempotency + retry backoff

ALTER TABLE "PlatformWorkflowRun" ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformWorkflowRun_user_idempotency_idx"
  ON "PlatformWorkflowRun" ("userId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

ALTER TABLE "PlatformWorkflowStep" ADD COLUMN IF NOT EXISTS "retryAfter" timestamp;

CREATE INDEX IF NOT EXISTS "PlatformWorkflowStep_retry_after_idx"
  ON "PlatformWorkflowStep" ("status", "retryAfter")
  WHERE "status" = 'waiting';
