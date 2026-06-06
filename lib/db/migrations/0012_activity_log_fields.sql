ALTER TABLE "ToolEvent" ADD COLUMN IF NOT EXISTS "level" varchar DEFAULT 'info' NOT NULL;
ALTER TABLE "ToolEvent" ADD COLUMN IF NOT EXISTS "message" text;

UPDATE "ToolEvent"
SET
  "message" = "toolName",
  "level" = CASE WHEN "status" = 'error' THEN 'error' ELSE 'success' END
WHERE "message" IS NULL;
