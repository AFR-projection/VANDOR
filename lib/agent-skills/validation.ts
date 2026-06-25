import { z } from "zod";
import {
  agentSkillCategories,
  agentSkillTypes,
} from "@/lib/db/schema";

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "Slug: huruf kecil, angka, underscore");

const httpParamSchema = z.object({
  type: z.enum(["string", "number", "boolean"]).default("string"),
  required: z.boolean().optional(),
  description: z.string().optional(),
  in: z.enum(["query", "body", "header", "path"]).optional(),
});

const httpApiConfigSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  endpoint: z.string().url(),
  headers: z.record(z.string()).optional(),
  parameters: z.record(httpParamSchema).optional(),
  auth: z
    .object({
      type: z.enum(["none", "bearer", "basic", "api_key"]).default("none"),
      apiKeyId: z.string().uuid().optional(),
      headerName: z.string().optional(),
    })
    .optional(),
  bodyTemplate: z.record(z.unknown()).optional(),
});

const knowledgeBaseConfigSchema = z.object({
  maxResults: z.number().int().min(1).max(20).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
});

const webSearchConfigSchema = z.object({
  maxResults: z.number().int().min(3).max(10).optional(),
  news: z.boolean().optional(),
});

const databaseConfigSchema = z.object({
  engine: z.enum(["postgresql", "mysql"]),
  connectionApiKeyId: z.string().uuid(),
  allowedTables: z.array(z.string()).optional(),
  maxRows: z.number().int().min(1).max(500).optional(),
  readOnly: z.boolean().optional(),
});

const workflowConfigSchema = z.object({
  steps: z
    .array(
      z.object({
        skillSlug: z.string().min(1),
        parameterMapping: z.record(z.string()).optional(),
      })
    )
    .min(1)
    .max(10),
});

const parlayCalculatorConfigSchema = z.object({
  greeting: z.string().max(64).optional(),
});

export const createSkillSchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(120),
  description: z.string().min(5).max(2000),
  category: z.enum(agentSkillCategories).default("api"),
  skillType: z.enum(agentSkillTypes).default("http_api"),
  config: z.record(z.unknown()),
  isActive: z.boolean().optional(),
  rateLimitPerHour: z.number().int().min(1).max(10_000).optional(),
});

export const updateSkillSchema = createSkillSchema.partial().omit({ slug: true });

export function validateSkillConfig(
  skillType: (typeof agentSkillTypes)[number],
  config: Record<string, unknown>
): Record<string, unknown> {
  switch (skillType) {
    case "http_api":
      return httpApiConfigSchema.parse(config);
    case "knowledge_base":
      return knowledgeBaseConfigSchema.parse(config);
    case "web_search":
      return webSearchConfigSchema.parse(config);
    case "database":
      return databaseConfigSchema.parse(config);
    case "workflow":
      return workflowConfigSchema.parse(config);
    case "parlay_calculator":
      return parlayCalculatorConfigSchema.parse(config);
    default:
      return config;
  }
}

export const testSkillSchema = z.object({
  parameters: z.record(z.unknown()).optional(),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(128),
  value: z.string().min(1).max(4096),
});
