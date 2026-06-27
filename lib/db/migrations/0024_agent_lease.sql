-- VANDOR Autonomous — DB lease (leader election, pooling-agnostic)

ALTER TABLE "AgentState" ADD COLUMN IF NOT EXISTS "leaseOwner" varchar(80);
ALTER TABLE "AgentState" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamp;
