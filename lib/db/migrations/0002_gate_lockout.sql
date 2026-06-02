CREATE TABLE IF NOT EXISTS "GateLockout" (
  "ip" text PRIMARY KEY NOT NULL,
  "failedAttempts" integer NOT NULL DEFAULT 0,
  "lockedUntil" timestamp,
  "lastFailedAt" timestamp NOT NULL DEFAULT now()
);
