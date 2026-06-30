import { recordAgentAction } from "../audit";
import type { AutoFixResult } from "../auto-fix";
import { autonomousConfig } from "../config";
import { emitEvent } from "../events";
import { notify, notifyApprovalRequest } from "../notify";
import { recordOperatorIncident } from "../operator-memory";
import { resolveOwnerUserId } from "../owner";
import { createApproval } from "../permission";
import { canAutoFixCommand } from "../rule-engine";
import type { Issue } from "./detectors";

const severityToAgentEvent = {
  warn: "warn",
  error: "error",
  critical: "critical",
} as const;

function fixedIssueKeys(autoFix: AutoFixResult | undefined): Set<string> {
  const keys = new Set<string>();
  if (!autoFix) {
    return keys;
  }
  for (const d of autoFix.details) {
    if (d.ok) {
      keys.add(d.issueKey);
    }
  }
  return keys;
}

/**
 * Tangani daftar isu setelah auto-fix.
 * - Isu sudah auto-fixed → skip approval, catat event saja.
 * - Isu dengan remediasi non-auto-fix → approval (deploy/systemctl dll).
 * - Isu critical/error → notifikasi WA proaktif ke owner.
 */
export async function handleIssues(
  issues: Issue[],
  options?: {
    autonomous?: boolean;
    autoFix?: AutoFixResult;
  }
): Promise<{
  approvalsCreated: number;
  notified: number;
}> {
  let approvalsCreated = 0;
  let notified = 0;
  const ownerUserId = await resolveOwnerUserId();
  const alreadyFixed = fixedIssueKeys(options?.autoFix);
  const autoFixOn =
    autonomousConfig.autoFixEnabled &&
    (options?.autonomous || autonomousConfig.autoFixWithoutAutonomousMode);

  await Promise.all(
    issues.map(async (issue) => {
      if (alreadyFixed.has(issue.key)) {
        return;
      }

      await recordOperatorIncident({
        userId: ownerUserId,
        issue,
        outcome: "detected",
      });

      await emitEvent({
        type: "issue",
        severity: severityToAgentEvent[issue.severity],
        source: "detector",
        message: `${issue.title} — ${issue.detail}`.slice(0, 1000),
        payload: { key: issue.key, remediation: issue.remediation ?? null },
      });

      const command = issue.remediation?.command?.trim();
      const skipApproval = autoFixOn && command && canAutoFixCommand(command);

      if (command && !skipApproval) {
        const { id, deduped } = await createApproval({
          actionType: "remediation",
          summary: `${issue.title}: ${issue.remediation?.description} (\`${command}\`)`,
          payload: {
            issueKey: issue.key,
            command,
            description: issue.remediation?.description,
          },
          riskLevel: issue.remediation?.risk ?? "moderate",
        });
        if (!deduped) {
          approvalsCreated += 1;
          await recordOperatorIncident({
            userId: ownerUserId,
            issue,
            outcome: "approval_requested",
            command,
          });
          await recordAgentAction({
            tool: "healing",
            action: "create-approval",
            input: { issue: issue.key },
            output: { command },
            status: "pending",
            riskLevel: issue.remediation?.risk ?? "moderate",
            reason: issue.remediation?.description,
          });
          await notifyApprovalRequest({
            id,
            summary: issue.remediation?.description ?? issue.title,
            riskLevel: issue.remediation?.risk ?? "moderate",
          });
        }
      }

      if (issue.severity === "warn" && command && !skipApproval && !autoFixOn) {
        await notify({
          title: issue.title,
          body: `${issue.detail}\n\nSaran: ${issue.remediation?.description ?? "—"}`,
          level: "warn",
        });
        notified += 1;
      }
    })
  );

  return { approvalsCreated, notified };
}
