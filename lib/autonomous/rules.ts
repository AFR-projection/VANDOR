import { asc, eq } from "drizzle-orm";
import {
  type AgentRiskLevel,
  type AgentRule,
  type AgentRuleKind,
  agentRiskLevels,
  agentRule,
  agentRuleKinds,
} from "@/lib/db/schema";
import { db } from "./db";

export type CreateRuleInput = {
  name: string;
  kind: AgentRuleKind;
  pattern: string;
  riskLevel?: AgentRiskLevel;
  priority?: number;
  note?: string | null;
  enabled?: boolean;
};

export type UpdateRuleInput = Partial<CreateRuleInput>;

const DEFAULT_RULES: CreateRuleInput[] = [
  {
    name: "block-pipe-to-shell",
    kind: "deny",
    pattern: String.raw`(curl|wget).*\|\s*(sh|bash)`,
    riskLevel: "dangerous",
    priority: 10,
    note: "Cegah pipe-to-shell",
  },
  {
    name: "allow-pm2-readonly",
    kind: "allow",
    pattern: String.raw`^pm2\s+(list|jlist|status|describe|logs|info)`,
    riskLevel: "safe",
    priority: 20,
    note: "PM2 read-only auto",
  },
  {
    name: "require-pm2-restart",
    kind: "require_approval",
    pattern: String.raw`^pm2\s+(restart|reload|delete|stop)`,
    riskLevel: "moderate",
    priority: 30,
    note: "PM2 mutasi butuh approval",
  },
  {
    name: "allow-auto-fix-npm",
    kind: "allow",
    pattern: String.raw`^npm run (fix|check|build)\b`,
    riskLevel: "safe",
    priority: 25,
    note: "Auto-fix codebase tanpa approval",
  },
  {
    name: "allow-auto-fix-pm2-vandor",
    kind: "allow",
    pattern: String.raw`^pm2 (restart|reload) (vandor|vandor-agent)\b`,
    riskLevel: "moderate",
    priority: 26,
    note: "Restart proses VANDOR — auto-fix",
  },
];

export async function ensureDefaultRules(): Promise<void> {
  const existing = await db.select({ name: agentRule.name }).from(agentRule);
  const have = new Set(existing.map((r) => r.name));
  const missing = DEFAULT_RULES.filter((r) => !have.has(r.name));
  if (missing.length === 0) {
    return;
  }
  await db.insert(agentRule).values(missing);
}

export function listRules() {
  return db
    .select()
    .from(agentRule)
    .orderBy(asc(agentRule.priority), asc(agentRule.name));
}

export async function createRule(input: CreateRuleInput): Promise<AgentRule> {
  if (!agentRuleKinds.includes(input.kind)) {
    throw new Error("kind tidak valid");
  }
  try {
    new RegExp(input.pattern, "i");
  } catch {
    throw new Error("pattern regex tidak valid");
  }

  const risk = input.riskLevel ?? "moderate";
  if (!agentRiskLevels.includes(risk)) {
    throw new Error("riskLevel tidak valid");
  }

  const inserted = await db
    .insert(agentRule)
    .values({
      name: input.name.trim().slice(0, 128),
      kind: input.kind,
      pattern: input.pattern.trim(),
      riskLevel: risk,
      priority: input.priority ?? 100,
      note: input.note?.trim().slice(0, 500) ?? null,
      enabled: input.enabled ?? true,
    })
    .returning();
  return inserted[0];
}

export async function updateRule(
  id: string,
  input: UpdateRuleInput
): Promise<AgentRule | null> {
  const patch: Partial<typeof agentRule.$inferInsert> = {};
  if (input.name !== undefined) {
    patch.name = input.name.trim().slice(0, 128);
  }
  if (input.kind !== undefined) {
    if (!agentRuleKinds.includes(input.kind)) {
      return null;
    }
    patch.kind = input.kind;
  }
  if (input.pattern !== undefined) {
    try {
      new RegExp(input.pattern, "i");
    } catch {
      return null;
    }
    patch.pattern = input.pattern.trim();
  }
  if (input.riskLevel !== undefined) {
    if (!agentRiskLevels.includes(input.riskLevel)) {
      return null;
    }
    patch.riskLevel = input.riskLevel;
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
  }
  if (input.note !== undefined) {
    patch.note = input.note?.trim().slice(0, 500) ?? null;
  }
  if (input.enabled !== undefined) {
    patch.enabled = input.enabled;
  }

  const updated = await db
    .update(agentRule)
    .set(patch)
    .where(eq(agentRule.id, id))
    .returning();
  return updated[0] ?? null;
}

export async function deleteRule(id: string): Promise<boolean> {
  const res = await db
    .delete(agentRule)
    .where(eq(agentRule.id, id))
    .returning({ id: agentRule.id });
  return res.length > 0;
}

export function getRule(id: string) {
  return db
    .select()
    .from(agentRule)
    .where(eq(agentRule.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}
