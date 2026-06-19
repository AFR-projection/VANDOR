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
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type UserSecretsRow = InferSelectModel<typeof userSecrets>;

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
] as const;

export type VaultSourceType = (typeof vaultSourceTypes)[number];

export const vaultAuditActions = [
  "upload",
  "download",
  "delete",
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
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type VaultFile = InferSelectModel<typeof vaultFile>;

export const vaultAuditLog = pgTable("VaultAuditLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  fileId: uuid("fileId").references(() => vaultFile.id, { onDelete: "set null" }),
  action: varchar("action", { length: 32 }).notNull(),
  detail: json("detail"),
  ip: text("ip"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type VaultAuditLog = InferSelectModel<typeof vaultAuditLog>;
