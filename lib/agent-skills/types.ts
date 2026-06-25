import type {
  AgentSkillCategory,
  AgentSkillType,
} from "@/lib/db/schema";

export const SKILL_TOOL_PREFIX = "skill_" as const;

export type SkillToolName = `${typeof SKILL_TOOL_PREFIX}${string}`;

export function toSkillToolName(slug: string): SkillToolName {
  const safe = slug.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48);
  return `${SKILL_TOOL_PREFIX}${safe}`;
}

export function fromSkillToolName(toolName: string): string | null {
  if (!toolName.startsWith(SKILL_TOOL_PREFIX)) {
    return null;
  }
  return toolName.slice(SKILL_TOOL_PREFIX.length);
}

export type HttpParamDef = {
  type: "string" | "number" | "boolean";
  required?: boolean;
  description?: string;
  in?: "query" | "body" | "header" | "path";
};

export type HttpApiSkillConfig = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  headers?: Record<string, string>;
  parameters?: Record<string, HttpParamDef>;
  auth?: {
    type: "none" | "bearer" | "basic" | "api_key";
    apiKeyId?: string;
    headerName?: string;
  };
  bodyTemplate?: Record<string, unknown>;
};

export type KnowledgeBaseSkillConfig = {
  maxResults?: number;
  minSimilarity?: number;
};

export type WebSearchSkillConfig = {
  maxResults?: number;
  news?: boolean;
};

export type DatabaseSkillConfig = {
  engine: "postgresql" | "mysql";
  connectionApiKeyId: string;
  allowedTables?: string[];
  maxRows?: number;
  readOnly?: boolean;
};

export type WorkflowStepConfig = {
  skillSlug: string;
  parameterMapping?: Record<string, string>;
};

export type WorkflowSkillConfig = {
  steps: WorkflowStepConfig[];
};

export type ParlayCalculatorSkillConfig = {
  /** Prefix sapaan di output CS */
  greeting?: string;
};

export type SkillConfig =
  | HttpApiSkillConfig
  | KnowledgeBaseSkillConfig
  | WebSearchSkillConfig
  | DatabaseSkillConfig
  | WorkflowSkillConfig
  | ParlayCalculatorSkillConfig;

export type AgentSkillRecord = {
  id: string;
  userId: string;
  slug: string;
  name: string;
  description: string;
  category: AgentSkillCategory;
  skillType: AgentSkillType;
  config: SkillConfig;
  isActive: boolean;
  isBuiltin: boolean;
  rateLimitPerHour: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SkillExecutionContext = {
  userId: string;
  chatId?: string | null;
  openRouterApiKey?: string | null;
};

export type SkillExecutionResult = {
  ok: boolean;
  data?: unknown;
  error?: string;
  executionTimeMs: number;
};
