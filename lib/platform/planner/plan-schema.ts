import { z } from "zod";
import { PLATFORM_AGENT_IDS } from "../core/types";

const planStepSchema = z.object({
  stepKey: z.string().min(1).max(64),
  agentId: z.enum(PLATFORM_AGENT_IDS),
  input: z.record(z.unknown()).optional(),
  dependsOn: z.array(z.string()).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
});

export const executionPlanSchema = z.object({
  summary: z.string().min(1).max(500),
  steps: z.array(planStepSchema).min(1).max(12),
});

export type ParsedExecutionPlan = z.infer<typeof executionPlanSchema>;
