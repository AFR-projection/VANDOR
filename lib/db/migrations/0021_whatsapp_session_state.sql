CREATE TABLE IF NOT EXISTS "WhatsappSessionState" (
  "userId" uuid PRIMARY KEY NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "status" varchar(16) NOT NULL DEFAULT 'idle',
  "qrDataUrl" text,
  "me" varchar(32),
  "error" text,
  "updatedAt" timestamp NOT NULL DEFAULT now()
);
