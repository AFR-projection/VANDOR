CREATE TABLE IF NOT EXISTS "NumpadSession" (
  "sid" text PRIMARY KEY NOT NULL,
  "deviceId" text,
  "ip" text,
  "userAgent" text,
  "locationLabel" text,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "lastSeenAt" timestamp DEFAULT now() NOT NULL,
  "revokedAt" timestamp
);

CREATE TABLE IF NOT EXISTS "LoginHistory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sid" text,
  "ip" text NOT NULL,
  "userAgent" text,
  "locationLabel" text,
  "city" text,
  "region" text,
  "country" text,
  "loggedInAt" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "LoginHistory_loggedInAt_idx" ON "LoginHistory" ("loggedInAt" DESC);
