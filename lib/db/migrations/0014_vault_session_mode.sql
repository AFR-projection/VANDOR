-- Vault Session Isolation
-- ─────────────────────────────────────────────
-- `mode` differentiates chat types:
--   chat         → normal AI chat
--   vault        → isolated vault session (NO LLM, NO memory, vault commands only)
--   vault-locked → terminated vault session (read-only for history, never accessible to AI)

ALTER TABLE "Chat" ADD COLUMN IF NOT EXISTS "mode" varchar(16) NOT NULL DEFAULT 'chat';

CREATE INDEX IF NOT EXISTS "Chat_mode_idx" ON "Chat" ("mode");
