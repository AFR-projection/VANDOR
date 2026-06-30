import type { VandorIntent } from "@/lib/v4/intent";
import type { ExecutionPlan, PlatformAgentId } from "../core/types";

function step(
  stepKey: string,
  agentId: PlatformAgentId,
  input?: Record<string, unknown>
) {
  return { stepKey, agentId, input };
}

const SCAN_CODEBASE_RE =
  /\b(scan\s+(?:code|codebase|repo)|perbaiki\s+(?:error|code|codebase)|cek\s+log)\b/i;
const FIX_RE = /\b(perbaiki|fix|auto-?fix|error|bug)\b/i;
const DEPLOY_RE =
  /\b(deploy(?:\s+(?:ke\s+)?(?:prod|production|vps|server))?|push\s+ke\s+(prod|vps|server)|release\s+(?:ke\s+)?prod|git\s+pull\s+(?:dan\s+)?build|pm2\s+reload)\b/i;

/** Fallback planner tanpa LLM — intent → agent pipeline deterministik. */
export function buildHeuristicPlan(input: {
  userText: string;
  intent: VandorIntent;
}): ExecutionPlan {
  const text = input.userText.trim();
  const base = { userRequest: text, intent: input.intent };
  const wantsCodeScan = SCAN_CODEBASE_RE.test(text);
  const wantsFix = FIX_RE.test(text);
  const wantsDeploy = DEPLOY_RE.test(text);

  switch (input.intent) {
    case "code": {
      const steps = [
        step("implement", "coding", base),
        step("verify", "testing", { scope: "full", userRequest: text }),
      ];
      if (wantsFix) {
        steps.push(
          step("diagnose", "fix", {
            ...base,
            mode: "autofix",
            autoFix: true,
          })
        );
      }
      if (wantsDeploy) {
        steps.push(
          step("deploy", "deploy", { action: "dispatch", userRequest: text })
        );
      }
      steps.push(
        step("respond", "chat", { message: text, formatWorkflow: true })
      );
      return {
        summary: wantsFix
          ? "Rencana kode: scan → test → auto-fix"
          : "Rencana kode: scan → test → verifikasi",
        steps,
      };
    }
    case "operator": {
      if (wantsDeploy && !wantsCodeScan) {
        return {
          summary: "Rencana deploy: preflight sistem → antre deploy (approval)",
          steps: [
            step("preflight", "monitoring", {
              action: "check_system",
              userRequest: text,
            }),
            step("deploy", "deploy", { action: "dispatch", userRequest: text }),
            step("respond", "chat", { message: text, formatWorkflow: true }),
          ],
        };
      }
      const steps = [
        step("monitor", "monitoring", {
          action: "check_system",
          userRequest: text,
        }),
      ];
      if (wantsCodeScan) {
        steps.push(
          step("scan", "coding", { ...base, action: "scan_codebase" })
        );
        if (wantsFix) {
          steps.push(
            step("diagnose", "fix", { ...base, mode: "autofix", autoFix: true })
          );
        }
      }
      steps.push(
        step("respond", "chat", { message: text, formatWorkflow: true })
      );
      return {
        summary: wantsCodeScan
          ? "Rencana operator: monitoring sistem + scan codebase"
          : "Rencana operator: monitoring sistem live",
        steps,
      };
    }
    case "document":
    case "pdf":
      return {
        summary: "Rencana dokumen: generate & rangkum",
        steps: [
          step("document", "document", base),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "search":
    case "map":
      return {
        summary: "Rencana riset: browser agent",
        steps: [
          step("research", "browser", base),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "image":
      return {
        summary: "Rencana media: generate gambar",
        steps: [
          step("generate_image", "tool", {
            ...base,
            action: "generate_image",
            prompt: text,
          }),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    case "chat_reasoning":
      return {
        summary: "Rencana analisis mendalam",
        steps: [
          step("plan", "planner", base),
          step("memory", "memory", { query: text }),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
    default:
      return {
        summary: "Rencana umum multi-agent",
        steps: [
          step("work", "tool", base),
          step("respond", "chat", { message: text, formatWorkflow: true }),
        ],
      };
  }
}
