import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
  name: text("name"),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  isAnonymous: boolean("isAnonymous").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
  mode: varchar("mode", { enum: ["chat", "vault", "vault-locked"] })
    .notNull()
    .default("chat"),
});

export type Chat = InferSelectModel<typeof chat>;
export type ChatMode = "chat" | "vault" | "vault-locked";

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.chatId, table.messageId] }),
  })
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.createdAt] }),
  })
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

export const memoryCategories = [
  "fact",
  "preference",
  "goal",
  "person",
  "event",
  "instruction",
] as const;

export type MemoryCategory = (typeof memoryCategories)[number];

export const userMemory = pgTable("UserMemory", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  category: varchar("category", { length: 32 }).notNull().default("fact"),
  importance: integer("importance").notNull().default(5),
  metadata: json("metadata"),
  sourceChatId: uuid("sourceChatId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserMemory = InferSelectModel<typeof userMemory>;

export const userSettings = pgTable("UserSettings", {
  userId: uuid("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  settings: json("settings").notNull().default({}),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserSettingsRow = InferSelectModel<typeof userSettings>;

export const userSecrets = pgTable("UserSecrets", {
  userId: uuid("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  openrouterApiKeyEnc: text("openrouterApiKeyEnc"),
  tavilyApiKeyEnc: text("tavilyApiKeyEnc"),
  numpadPinHash: text("numpadPinHash"),
  /** AES-GCM encrypted JSON — lihat lib/settings/integration-secret-keys.ts */
  extraSecretsEnc: text("extraSecretsEnc"),
  /** AES-GCM encrypted Baileys multi-file auth snapshot (serverless / Vercel). */
  whatsappAuthEnc: text("whatsappAuthEnc"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserSecretsRow = InferSelectModel<typeof userSecrets>;

/**
 * One-time verification codes generated in the web UI.
 * A WhatsApp user sends this code → bot validates → phone is registered as owner.
 */
export const whatsappVerifCode = pgTable("WhatsappVerifCode", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 16 }).notNull().unique(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  usedByPhone: varchar("usedByPhone", { length: 32 }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type WhatsappVerifCode = InferSelectModel<typeof whatsappVerifCode>;

/**
 * Verified WhatsApp owner numbers — persisted per user.
 * Multiple numbers can be registered (e.g. personal + work SIM).
 */
export const whatsappOwner = pgTable(
  "WhatsappOwner",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 32 }).notNull(),
    label: text("label"),
    verifiedAt: timestamp("verifiedAt").notNull().defaultNow(),
    revokedAt: timestamp("revokedAt"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.phone] }),
  })
);

export type WhatsappOwner = InferSelectModel<typeof whatsappOwner>;

/**
 * Audit log for WhatsApp verification events.
 */
export const whatsappVerifLog = pgTable("WhatsappVerifLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId").references(() => user.id, { onDelete: "set null" }),
  phone: varchar("phone", { length: 32 }),
  event: varchar("event", {
    enum: [
      "code_generated",
      "code_used",
      "code_invalid",
      "code_expired",
      "owner_added",
      "owner_revoked",
    ],
  }).notNull(),
  meta: json("meta"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type WhatsappVerifLog = InferSelectModel<typeof whatsappVerifLog>;

/** Shared WA UI state — survives serverless cold starts / multi-instance polling. */
export const whatsappSessionState = pgTable("WhatsappSessionState", {
  userId: uuid("userId")
    .primaryKey()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("idle"),
  qrDataUrl: text("qrDataUrl"),
  me: varchar("me", { length: 32 }),
  error: text("error"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type WhatsappSessionState = InferSelectModel<
  typeof whatsappSessionState
>;

export const gateLockout = pgTable("GateLockout", {
  ip: text("ip").primaryKey().notNull(),
  failedAttempts: integer("failedAttempts").notNull().default(0),
  lockedUntil: timestamp("lockedUntil"),
  lastFailedAt: timestamp("lastFailedAt").notNull().defaultNow(),
});

export type GateLockout = InferSelectModel<typeof gateLockout>;

export const gateSession = pgTable("GateSession", {
  id: text("id").primaryKey().notNull().default("singleton"),
  sid: text("sid").notNull(),
  device: text("device"),
  ip: text("ip"),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type GateSession = InferSelectModel<typeof gateSession>;

export const numpadSession = pgTable("NumpadSession", {
  sid: text("sid").primaryKey().notNull(),
  deviceId: text("deviceId"),
  ip: text("ip"),
  userAgent: text("userAgent"),
  locationLabel: text("locationLabel"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  lastSeenAt: timestamp("lastSeenAt").notNull().defaultNow(),
  revokedAt: timestamp("revokedAt"),
});

export type NumpadSession = InferSelectModel<typeof numpadSession>;

export const loginHistory = pgTable("LoginHistory", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sid: text("sid"),
  ip: text("ip").notNull(),
  userAgent: text("userAgent"),
  locationLabel: text("locationLabel"),
  city: text("city"),
  region: text("region"),
  country: text("country"),
  loggedInAt: timestamp("loggedInAt").notNull().defaultNow(),
});

export type LoginHistory = InferSelectModel<typeof loginHistory>;

export const persona = pgTable("Persona", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: varchar("kind", { enum: ["preset", "custom"] })
    .notNull()
    .default("custom"),
  systemPrompt: text("systemPrompt").notNull(),
  voice: json("voice").notNull(),
  style: json("style"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type Persona = InferSelectModel<typeof persona>;

export const callSession = pgTable("CallSession", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: uuid("chatId").references(() => chat.id),
  mode: varchar("mode", { enum: ["voice", "video"] }).notNull(),
  personaId: text("personaId"),
  modelId: text("modelId").notNull(),
  startedAt: timestamp("startedAt").notNull().defaultNow(),
  endedAt: timestamp("endedAt"),
  metrics: json("metrics"),
});

export type CallSession = InferSelectModel<typeof callSession>;

export const webArticleCache = pgTable("WebArticleCache", {
  url: text("url").primaryKey().notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull().defaultNow(),
});

export type WebArticleCache = InferSelectModel<typeof webArticleCache>;

export const userNote = pgTable("UserNote", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserNote = InferSelectModel<typeof userNote>;

export const userTask = pgTable("UserTask", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: varchar("status", { enum: ["pending", "done", "cancelled"] })
    .notNull()
    .default("pending"),
  dueAt: timestamp("dueAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserTask = InferSelectModel<typeof userTask>;

export const chatSummary = pgTable("ChatSummary", {
  chatId: uuid("chatId")
    .primaryKey()
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  messageCount: integer("messageCount").notNull().default(0),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type ChatSummary = InferSelectModel<typeof chatSummary>;

export const webSearchCache = pgTable("WebSearchCache", {
  queryHash: text("queryHash").primaryKey().notNull(),
  query: text("query").notNull(),
  results: json("results").notNull(),
  provider: text("provider").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull().defaultNow(),
});

export type WebSearchCache = InferSelectModel<typeof webSearchCache>;

export const responseCache = pgTable("ResponseCache", {
  cacheKey: text("cacheKey").primaryKey().notNull(),
  response: text("response").notNull(),
  modelId: text("modelId").notNull(),
  fetchedAt: timestamp("fetchedAt").notNull().defaultNow(),
});

export type ResponseCache = InferSelectModel<typeof responseCache>;

export const toolEvent = pgTable("ToolEvent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: uuid("chatId").references(() => chat.id, { onDelete: "set null" }),
  toolName: varchar("toolName", { length: 64 }).notNull(),
  level: varchar("level", {
    enum: ["info", "warn", "error", "success"],
  })
    .notNull()
    .default("info"),
  message: text("message"),
  status: varchar("status", { enum: ["ok", "error"] }).notNull(),
  durationMs: integer("durationMs"),
  detail: text("detail"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type ToolEvent = InferSelectModel<typeof toolEvent>;

export const vaultFileTypes = [
  "image",
  "video",
  "audio",
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "csv",
  "text",
  "code",
  "json",
  "archive",
  "document",
  "other",
] as const;

export type VaultFileType = (typeof vaultFileTypes)[number];

export const vaultSourceTypes = [
  "upload",
  "chat",
  "export",
  "note",
  "backup",
  "whatsapp",
] as const;

export type VaultSourceType = (typeof vaultSourceTypes)[number];

export const vaultAuditActions = [
  "upload",
  "download",
  "delete",
  "restore",
  "purge",
  "decrypt",
  "search",
] as const;

export type VaultAuditAction = (typeof vaultAuditActions)[number];

export const vaultFile = pgTable("VaultFile", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileName: text("fileName").notNull(),
  fileType: varchar("fileType", { length: 32 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: integer("fileSize").notNull(),
  r2Key: text("r2Key").notNull(),
  encrypted: boolean("encrypted").notNull().default(true),
  encIv: text("encIv").notNull(),
  encTag: text("encTag").notNull(),
  summary: text("summary"),
  tags: json("tags").$type<string[]>().default([]),
  extractedText: text("extractedText"),
  sourceType: varchar("sourceType", { length: 32 }).notNull().default("upload"),
  sourceChatId: uuid("sourceChatId"),
  sourceMessageId: uuid("sourceMessageId"),
  linkedMemoryId: uuid("linkedMemoryId"),
  metadata: json("metadata"),
  storageBackend: varchar("storageBackend", { length: 16 })
    .notNull()
    .default("r2"),
  pinned: boolean("pinned").notNull().default(false),
  folder: text("folder"),
  deletedAt: timestamp("deletedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type VaultFile = InferSelectModel<typeof vaultFile>;

export const vaultAuditLog = pgTable("VaultAuditLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileId: uuid("fileId").references(() => vaultFile.id, {
    onDelete: "set null",
  }),
  action: varchar("action", { length: 32 }).notNull(),
  detail: json("detail"),
  ip: text("ip"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type VaultAuditLog = InferSelectModel<typeof vaultAuditLog>;

export const agentSkillCategories = [
  "api",
  "knowledge_base",
  "web_search",
  "database",
  "workflow",
  "integration",
  "builtin",
] as const;

export type AgentSkillCategory = (typeof agentSkillCategories)[number];

export const agentSkillTypes = [
  "http_api",
  "knowledge_base",
  "web_search",
  "database",
  "workflow",
  "parlay_calculator",
] as const;

export type AgentSkillType = (typeof agentSkillTypes)[number];

export const agentSkill = pgTable(
  "AgentSkill",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    category: varchar("category", { length: 32 }).notNull().default("api"),
    skillType: varchar("skillType", { length: 32 })
      .notNull()
      .default("http_api"),
    config: json("config").notNull().default({}),
    isActive: boolean("isActive").notNull().default(true),
    isBuiltin: boolean("isBuiltin").notNull().default(false),
    rateLimitPerHour: integer("rateLimitPerHour").notNull().default(120),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    userSlugIdx: uniqueIndex("AgentSkill_userId_slug_idx").on(
      table.userId,
      table.slug
    ),
  })
);

export type AgentSkill = InferSelectModel<typeof agentSkill>;

export const agentSkillApiKey = pgTable("AgentSkillApiKey", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 128 }).notNull(),
  keyEnc: text("keyEnc").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentSkillApiKey = InferSelectModel<typeof agentSkillApiKey>;

export const agentSkillLog = pgTable("AgentSkillLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: uuid("chatId").references(() => chat.id, { onDelete: "set null" }),
  skillId: uuid("skillId").references(() => agentSkill.id, {
    onDelete: "set null",
  }),
  skillSlug: varchar("skillSlug", { length: 64 }).notNull(),
  skillName: text("skillName").notNull(),
  request: json("request"),
  response: json("response"),
  executionTimeMs: integer("executionTimeMs"),
  status: varchar("status", { length: 16 }).notNull().default("ok"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentSkillLog = InferSelectModel<typeof agentSkillLog>;

export const knowledgeBaseDocument = pgTable("KnowledgeBaseDocument", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  skillId: uuid("skillId").references(() => agentSkill.id, {
    onDelete: "set null",
  }),
  fileName: text("fileName").notNull(),
  mimeType: varchar("mimeType", { length: 128 }).notNull(),
  fileSize: integer("fileSize").notNull().default(0),
  extractedText: text("extractedText"),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  chunkCount: integer("chunkCount").notNull().default(0),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type KnowledgeBaseDocument = InferSelectModel<
  typeof knowledgeBaseDocument
>;

export const knowledgeBaseChunk = pgTable("KnowledgeBaseChunk", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  documentId: uuid("documentId")
    .notNull()
    .references(() => knowledgeBaseDocument.id, { onDelete: "cascade" }),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunkIndex").notNull(),
  content: text("content").notNull(),
  embedding: text("embedding"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type KnowledgeBaseChunk = InferSelectModel<typeof knowledgeBaseChunk>;

/* ============================================================
 * VANDOR Autonomous — Digital System Operator (Fase 0)
 * Otak otonom yang berjalan 24/7 (worker PM2 terpisah).
 * Tabel di bawah dipakai bersama oleh worker & dashboard.
 * ========================================================== */

export const agentModes = ["autonomous", "manual"] as const;
export type AgentMode = (typeof agentModes)[number];

export const agentRiskLevels = ["safe", "moderate", "dangerous"] as const;
export type AgentRiskLevel = (typeof agentRiskLevels)[number];

export const agentGoalStatuses = [
  "active",
  "paused",
  "done",
  "archived",
] as const;
export type AgentGoalStatus = (typeof agentGoalStatuses)[number];

export const agentTaskStatuses = [
  "queued",
  "running",
  "awaiting_approval",
  "done",
  "failed",
  "cancelled",
] as const;
export type AgentTaskStatus = (typeof agentTaskStatuses)[number];

export const agentActionStatuses = [
  "ok",
  "error",
  "blocked",
  "pending",
] as const;
export type AgentActionStatus = (typeof agentActionStatuses)[number];

export const agentApprovalStatuses = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "executed",
] as const;
export type AgentApprovalStatus = (typeof agentApprovalStatuses)[number];

export const agentScheduleKinds = ["cron", "interval"] as const;
export type AgentScheduleKind = (typeof agentScheduleKinds)[number];

/** Singleton state otak otonom (mode + kill switch + heartbeat). */
export const agentState = pgTable("AgentState", {
  id: varchar("id", { length: 32 }).primaryKey().notNull().default("default"),
  mode: varchar("mode", { enum: agentModes }).notNull().default("manual"),
  killSwitch: boolean("killSwitch").notNull().default(false),
  status: varchar("status", { length: 32 }).notNull().default("idle"),
  note: text("note"),
  leaseOwner: varchar("leaseOwner", { length: 80 }),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  lastHeartbeatAt: timestamp("lastHeartbeatAt"),
  lastTickAt: timestamp("lastTickAt"),
  tickCount: integer("tickCount").notNull().default(0),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentState = InferSelectModel<typeof agentState>;

/** Objective jangka panjang yang dikejar AI. */
export const agentGoal = pgTable("AgentGoal", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId").references(() => user.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  status: varchar("status", { enum: agentGoalStatuses })
    .notNull()
    .default("active"),
  priority: integer("priority").notNull().default(5),
  metadata: json("metadata"),
  deadline: timestamp("deadline"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentGoal = InferSelectModel<typeof agentGoal>;

/** Task queue — unit kerja yang dijalankan worker. */
export const agentTask = pgTable("AgentTask", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  goalId: uuid("goalId").references(() => agentGoal.id, {
    onDelete: "set null",
  }),
  type: varchar("type", { length: 64 }).notNull(),
  title: text("title").notNull(),
  payload: json("payload"),
  status: varchar("status", { enum: agentTaskStatuses })
    .notNull()
    .default("queued"),
  priority: integer("priority").notNull().default(5),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("maxAttempts").notNull().default(3),
  result: json("result"),
  error: text("error"),
  scheduledFor: timestamp("scheduledFor"),
  startedAt: timestamp("startedAt"),
  finishedAt: timestamp("finishedAt"),
  workflowRunId: uuid("workflowRunId"),
  workflowStepId: uuid("workflowStepId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentTask = InferSelectModel<typeof agentTask>;

/** Audit log — setiap aksi tool yang dijalankan/diblokir otak otonom. */
export const agentAction = pgTable("AgentAction", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  taskId: uuid("taskId").references(() => agentTask.id, {
    onDelete: "set null",
  }),
  approvalId: uuid("approvalId"),
  tool: varchar("tool", { length: 64 }).notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  input: json("input"),
  output: json("output"),
  status: varchar("status", { enum: agentActionStatuses })
    .notNull()
    .default("ok"),
  riskLevel: varchar("riskLevel", { enum: agentRiskLevels })
    .notNull()
    .default("safe"),
  reason: text("reason"),
  durationMs: integer("durationMs"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentAction = InferSelectModel<typeof agentAction>;

/** Antrian approval untuk aksi berisiko (mode konservatif). */
export const agentApproval = pgTable("AgentApproval", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  taskId: uuid("taskId").references(() => agentTask.id, {
    onDelete: "set null",
  }),
  actionType: varchar("actionType", { length: 64 }).notNull(),
  summary: text("summary").notNull(),
  payload: json("payload"),
  riskLevel: varchar("riskLevel", { enum: agentRiskLevels })
    .notNull()
    .default("dangerous"),
  status: varchar("status", { enum: agentApprovalStatuses })
    .notNull()
    .default("pending"),
  decidedBy: varchar("decidedBy", { length: 128 }),
  decidedAt: timestamp("decidedAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentApproval = InferSelectModel<typeof agentApproval>;

/** Jadwal job (cron/interval) yang memicu task otomatis. */
export const agentSchedule = pgTable("AgentSchedule", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  kind: varchar("kind", { enum: agentScheduleKinds })
    .notNull()
    .default("interval"),
  expression: varchar("expression", { length: 128 }).notNull(),
  taskType: varchar("taskType", { length: 64 }).notNull(),
  payload: json("payload"),
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("lastRunAt"),
  nextRunAt: timestamp("nextRunAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type AgentSchedule = InferSelectModel<typeof agentSchedule>;

/* ---------- VANDOR Autonomous — Observability & Safety (Fase 1-4) ---------- */

/** Snapshot metrik sistem untuk dashboard & analisis tren. */
export const systemMetric = pgTable("SystemMetric", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  host: varchar("host", { length: 128 }),
  cpuPct: integer("cpuPct"),
  memUsedPct: integer("memUsedPct"),
  diskUsedPct: integer("diskUsedPct"),
  load1x100: integer("load1x100"),
  uptimeSec: integer("uptimeSec"),
  payload: json("payload"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type SystemMetric = InferSelectModel<typeof systemMetric>;

export const agentEventSeverities = [
  "info",
  "warn",
  "error",
  "critical",
] as const;
export type AgentEventSeverity = (typeof agentEventSeverities)[number];

/** Event system — perubahan sistem yang dapat memicu aksi/triggers. */
export const agentEvent = pgTable("AgentEvent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  type: varchar("type", { length: 64 }).notNull(),
  severity: varchar("severity", { enum: agentEventSeverities })
    .notNull()
    .default("info"),
  source: varchar("source", { length: 64 }).notNull(),
  message: text("message").notNull(),
  payload: json("payload"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentEvent = InferSelectModel<typeof agentEvent>;

export const agentRuleKinds = ["allow", "deny", "require_approval"] as const;
export type AgentRuleKind = (typeof agentRuleKinds)[number];

/** Rule Engine — batas keamanan untuk keputusan otonom. */
export const agentRule = pgTable("AgentRule", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  name: varchar("name", { length: 128 }).notNull(),
  kind: varchar("kind", { enum: agentRuleKinds }).notNull().default("deny"),
  pattern: text("pattern").notNull(),
  riskLevel: varchar("riskLevel", { enum: agentRiskLevels })
    .notNull()
    .default("dangerous"),
  enabled: boolean("enabled").notNull().default(true),
  priority: integer("priority").notNull().default(100),
  note: text("note"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentRule = InferSelectModel<typeof agentRule>;

export const agentNotificationStatuses = ["queued", "sent", "failed"] as const;
export type AgentNotificationStatus =
  (typeof agentNotificationStatuses)[number];

/** Notifikasi keluar (WhatsApp/Telegram/Discord/Email). */
export const agentNotification = pgTable("AgentNotification", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  channel: varchar("channel", { length: 32 }).notNull().default("whatsapp"),
  level: varchar("level", { enum: agentEventSeverities })
    .notNull()
    .default("info"),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { enum: agentNotificationStatuses })
    .notNull()
    .default("queued"),
  error: text("error"),
  sentAt: timestamp("sentAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentNotification = InferSelectModel<typeof agentNotification>;

export const agentTerminalStreams = [
  "cli",
  "coding",
  "shell",
  "deploy",
  "worker",
] as const;
export type AgentTerminalStream = (typeof agentTerminalStreams)[number];

/** Transcript terminal nyata — setiap baris output CLI/agent tercatat di DB. */
export const agentTerminalLog = pgTable("AgentTerminalLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sessionId: uuid("sessionId").notNull(),
  stream: varchar("stream", { enum: agentTerminalStreams })
    .notNull()
    .default("cli"),
  line: text("line").notNull(),
  level: varchar("level", { length: 16 }).notNull().default("stdout"),
  command: text("command"),
  exitCode: integer("exitCode"),
  taskId: uuid("taskId").references(() => agentTask.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type AgentTerminalLog = InferSelectModel<typeof agentTerminalLog>;

/* ---------- Multi-Agent Platform V2 (Fase 0) ---------- */

export const platformWorkflowRunStatuses = [
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
] as const;
export type PlatformWorkflowRunStatus =
  (typeof platformWorkflowRunStatuses)[number];

export const platformWorkflowStepStatuses = [
  "pending",
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "skipped",
  "cancelled",
] as const;
export type PlatformWorkflowStepStatus =
  (typeof platformWorkflowStepStatuses)[number];

export const platformLogLevels = ["debug", "info", "warn", "error"] as const;
export type PlatformLogLevel = (typeof platformLogLevels)[number];

/** Satu permintaan user end-to-end (workflow run). */
export const platformWorkflowRun = pgTable("PlatformWorkflowRun", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  chatId: uuid("chatId").references(() => chat.id, { onDelete: "set null" }),
  status: varchar("status", { enum: platformWorkflowRunStatuses })
    .notNull()
    .default("pending"),
  planJson: json("planJson"),
  inputSummary: text("inputSummary"),
  outputSummary: text("outputSummary"),
  totalTokens: integer("totalTokens").notNull().default(0),
  totalCostMicroUsd: integer("totalCostMicroUsd").notNull().default(0),
  error: text("error"),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type PlatformWorkflowRun = InferSelectModel<typeof platformWorkflowRun>;

/** Satu node agent dalam DAG workflow. */
export const platformWorkflowStep = pgTable("PlatformWorkflowStep", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  runId: uuid("runId")
    .notNull()
    .references(() => platformWorkflowRun.id, { onDelete: "cascade" }),
  agentId: varchar("agentId", { length: 64 }).notNull(),
  stepKey: varchar("stepKey", { length: 64 }).notNull(),
  status: varchar("status", { enum: platformWorkflowStepStatuses })
    .notNull()
    .default("pending"),
  input: json("input"),
  output: json("output"),
  attempt: integer("attempt").notNull().default(0),
  maxAttempts: integer("maxAttempts").notNull().default(3),
  parentStepId: uuid("parentStepId"),
  sortOrder: integer("sortOrder").notNull().default(0),
  error: text("error"),
  retryAfter: timestamp("retryAfter"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type PlatformWorkflowStep = InferSelectModel<
  typeof platformWorkflowStep
>;

/** Event bus platform — persist + SSE feed dashboard. */
export const platformEvent = pgTable("PlatformEvent", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  runId: uuid("runId").references(() => platformWorkflowRun.id, {
    onDelete: "cascade",
  }),
  stepId: uuid("stepId").references(() => platformWorkflowStep.id, {
    onDelete: "set null",
  }),
  topic: varchar("topic", { length: 64 }).notNull(),
  agentId: varchar("agentId", { length: 64 }),
  payload: json("payload"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type PlatformEvent = InferSelectModel<typeof platformEvent>;

/** Live log per agent instance (step). */
export const platformAgentRunLog = pgTable("PlatformAgentRunLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  stepId: uuid("stepId")
    .notNull()
    .references(() => platformWorkflowStep.id, { onDelete: "cascade" }),
  level: varchar("level", { enum: platformLogLevels })
    .notNull()
    .default("info"),
  message: text("message").notNull(),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type PlatformAgentRunLog = InferSelectModel<typeof platformAgentRunLog>;
