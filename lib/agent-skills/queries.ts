import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  agentSkill,
  agentSkillApiKey,
  agentSkillLog,
  knowledgeBaseDocument,
} from "@/lib/db/schema";
import { encryptSecret, maskSecret } from "@/lib/security/crypto";
import type { AgentSkillRecord, SkillConfig } from "./types";

const client = postgres(process.env.POSTGRES_URL ?? "", { prepare: false });
const db = drizzle(client);

function mapSkill(row: typeof agentSkill.$inferSelect): AgentSkillRecord {
  return {
    id: row.id,
    userId: row.userId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category as AgentSkillRecord["category"],
    skillType: row.skillType as AgentSkillRecord["skillType"],
    config: row.config as SkillConfig,
    isActive: row.isActive,
    isBuiltin: row.isBuiltin,
    rateLimitPerHour: row.rateLimitPerHour,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAgentSkills(
  userId: string
): Promise<AgentSkillRecord[]> {
  const rows = await db
    .select()
    .from(agentSkill)
    .where(eq(agentSkill.userId, userId))
    .orderBy(desc(agentSkill.updatedAt));
  return rows.map(mapSkill);
}

export async function listActiveAgentSkills(
  userId: string
): Promise<AgentSkillRecord[]> {
  const rows = await db
    .select()
    .from(agentSkill)
    .where(and(eq(agentSkill.userId, userId), eq(agentSkill.isActive, true)))
    .orderBy(desc(agentSkill.updatedAt));
  return rows.map(mapSkill);
}

export async function getAgentSkillById(
  userId: string,
  id: string
): Promise<AgentSkillRecord | null> {
  const [row] = await db
    .select()
    .from(agentSkill)
    .where(and(eq(agentSkill.userId, userId), eq(agentSkill.id, id)))
    .limit(1);
  return row ? mapSkill(row) : null;
}

export async function getAgentSkillBySlug(
  userId: string,
  slug: string
): Promise<AgentSkillRecord | null> {
  const [row] = await db
    .select()
    .from(agentSkill)
    .where(and(eq(agentSkill.userId, userId), eq(agentSkill.slug, slug)))
    .limit(1);
  return row ? mapSkill(row) : null;
}

export async function createAgentSkill(input: {
  userId: string;
  slug: string;
  name: string;
  description: string;
  category: AgentSkillRecord["category"];
  skillType: AgentSkillRecord["skillType"];
  config: SkillConfig;
  isActive?: boolean;
  isBuiltin?: boolean;
  rateLimitPerHour?: number;
}): Promise<AgentSkillRecord> {
  const [row] = await db
    .insert(agentSkill)
    .values({
      userId: input.userId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      category: input.category,
      skillType: input.skillType,
      config: input.config,
      isActive: input.isActive ?? true,
      isBuiltin: input.isBuiltin ?? false,
      rateLimitPerHour: input.rateLimitPerHour ?? 120,
      updatedAt: new Date(),
    })
    .returning();
  return mapSkill(row);
}

export async function updateAgentSkill(
  userId: string,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    category: AgentSkillRecord["category"];
    skillType: AgentSkillRecord["skillType"];
    config: SkillConfig;
    isActive: boolean;
    rateLimitPerHour: number;
  }>
): Promise<AgentSkillRecord | null> {
  const [row] = await db
    .update(agentSkill)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(agentSkill.userId, userId), eq(agentSkill.id, id)))
    .returning();
  return row ? mapSkill(row) : null;
}

export async function deleteAgentSkill(
  userId: string,
  id: string
): Promise<boolean> {
  const existing = await getAgentSkillById(userId, id);
  if (!existing || existing.isBuiltin) {
    return false;
  }
  await db
    .delete(agentSkill)
    .where(and(eq(agentSkill.userId, userId), eq(agentSkill.id, id)));
  return true;
}

export async function upsertBuiltinSkill(input: {
  userId: string;
  slug: string;
  name: string;
  description: string;
  category: AgentSkillRecord["category"];
  skillType: AgentSkillRecord["skillType"];
  config: SkillConfig;
}): Promise<AgentSkillRecord> {
  const existing = await getAgentSkillBySlug(input.userId, input.slug);
  if (existing) {
    const updated = await updateAgentSkill(input.userId, existing.id, {
      description: input.description,
    });
    return updated ?? existing;
  }
  return createAgentSkill({ ...input, isBuiltin: true });
}

export async function listSkillLogs(
  userId: string,
  options?: { skillId?: string; limit?: number }
) {
  const limit = options?.limit ?? 50;
  const conditions = [eq(agentSkillLog.userId, userId)];
  if (options?.skillId) {
    conditions.push(eq(agentSkillLog.skillId, options.skillId));
  }
  const rows = await db
    .select()
    .from(agentSkillLog)
    .where(and(...conditions))
    .orderBy(desc(agentSkillLog.createdAt))
    .limit(limit);
  return rows;
}

export async function insertSkillLog(input: {
  userId: string;
  chatId?: string | null;
  skillId?: string | null;
  skillSlug: string;
  skillName: string;
  request?: unknown;
  response?: unknown;
  executionTimeMs?: number;
  status: "ok" | "error";
  errorMessage?: string | null;
}) {
  const [row] = await db
    .insert(agentSkillLog)
    .values({
      userId: input.userId,
      chatId: input.chatId ?? null,
      skillId: input.skillId ?? null,
      skillSlug: input.skillSlug,
      skillName: input.skillName,
      request: input.request ?? null,
      response: input.response ?? null,
      executionTimeMs: input.executionTimeMs ?? null,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
    })
    .returning();
  return row;
}

export async function listApiKeys(userId: string) {
  const rows = await db
    .select({
      id: agentSkillApiKey.id,
      name: agentSkillApiKey.name,
      createdAt: agentSkillApiKey.createdAt,
      updatedAt: agentSkillApiKey.updatedAt,
    })
    .from(agentSkillApiKey)
    .where(eq(agentSkillApiKey.userId, userId))
    .orderBy(desc(agentSkillApiKey.updatedAt));
  return rows;
}

export async function createApiKey(
  userId: string,
  name: string,
  value: string
) {
  const [row] = await db
    .insert(agentSkillApiKey)
    .values({
      userId,
      name,
      keyEnc: encryptSecret(value),
      updatedAt: new Date(),
    })
    .returning({
      id: agentSkillApiKey.id,
      name: agentSkillApiKey.name,
      createdAt: agentSkillApiKey.createdAt,
    });
  return row;
}

export async function deleteApiKey(userId: string, id: string) {
  await db
    .delete(agentSkillApiKey)
    .where(
      and(eq(agentSkillApiKey.userId, userId), eq(agentSkillApiKey.id, id))
    );
}

export async function getApiKeyValue(
  userId: string,
  id: string
): Promise<string | null> {
  const { decryptSecret } = await import("@/lib/security/crypto");
  const [row] = await db
    .select({ keyEnc: agentSkillApiKey.keyEnc })
    .from(agentSkillApiKey)
    .where(
      and(eq(agentSkillApiKey.userId, userId), eq(agentSkillApiKey.id, id))
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return decryptSecret(row.keyEnc);
}

export async function listKbDocuments(userId: string) {
  return db
    .select()
    .from(knowledgeBaseDocument)
    .where(eq(knowledgeBaseDocument.userId, userId))
    .orderBy(desc(knowledgeBaseDocument.createdAt));
}

export function publicApiKeyView(row: { id: string; name: string }) {
  return { id: row.id, name: row.name, masked: maskSecret("••••••••••••") };
}
