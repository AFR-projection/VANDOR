-- WhatsApp Owner Verification System
-- ─────────────────────────────────────────────
-- Adds three tables:
--   WhatsappVerifCode  → one-time codes generated in the web UI
--   WhatsappOwner      → verified phone numbers per user
--   WhatsappVerifLog   → audit trail for all verification events

CREATE TABLE IF NOT EXISTS "WhatsappVerifCode" (
  "id"           uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "userId"       uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "code"         varchar(16) NOT NULL UNIQUE,
  "expiresAt"    timestamp NOT NULL,
  "usedAt"       timestamp,
  "usedByPhone"  varchar(32),
  "createdAt"    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "WhatsappVerifCode_userId_idx"  ON "WhatsappVerifCode" ("userId");
CREATE INDEX IF NOT EXISTS "WhatsappVerifCode_code_idx"    ON "WhatsappVerifCode" ("code");

CREATE TABLE IF NOT EXISTS "WhatsappOwner" (
  "userId"      uuid NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "phone"       varchar(32) NOT NULL,
  "label"       text,
  "verifiedAt"  timestamp NOT NULL DEFAULT now(),
  "revokedAt"   timestamp,
  PRIMARY KEY ("userId", "phone")
);

CREATE INDEX IF NOT EXISTS "WhatsappOwner_userId_idx" ON "WhatsappOwner" ("userId");

CREATE TABLE IF NOT EXISTS "WhatsappVerifLog" (
  "id"        uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
  "userId"    uuid REFERENCES "User"("id") ON DELETE SET NULL,
  "phone"     varchar(32),
  "event"     varchar(32) NOT NULL,
  "meta"      jsonb,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "WhatsappVerifLog_userId_idx"    ON "WhatsappVerifLog" ("userId");
CREATE INDEX IF NOT EXISTS "WhatsappVerifLog_createdAt_idx" ON "WhatsappVerifLog" ("createdAt" DESC);
