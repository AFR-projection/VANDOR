CREATE TABLE IF NOT EXISTS "GateSession" (
  "id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
  "sid" text NOT NULL,
  "device" text,
  "ip" text,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
