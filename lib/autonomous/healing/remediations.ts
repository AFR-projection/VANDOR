import { recordAgentAction } from "../audit";
import { emitEvent } from "../events";
import { notify, notifyApprovalRequest } from "../notify";
import { recordOperatorIncident } from "../operator-memory";
import { createApproval } from "../permission";
import { resolveOwnerUserId } from "../owner";
import type { Issue } from "./detectors";

const severityToAgentEvent = {
  warn: "warn",
  error: "error",
  critical: "critical",
} as const;

/**
 * Tangani daftar isu. Postur KONSERVATIF:
 * - Isu dengan remediasi → buat permintaan approval (tidak auto-eksekusi).
 * - Isu critical/error → kirim notifikasi WhatsApp ke owner.
 * - Semua isu → catat sebagai event.
 */
export async function handleIssues(issues: Issue[]): Promise<{
  approvalsCreated: number;
  notified: number;
}> {
  let approvalsCreated = 0;
  let notified = 0;
  const ownerUserId = await resolveOwnerUserId();

  await Promise.all(
    issues.map(async (issue) => {
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

      if (issue.remediation?.command) {
        const { id, deduped } = await createApproval({
          actionType: "remediation",
          summary: `${issue.title}: ${issue.remediation.description} (\`${issue.remediation.command}\`)`,
          payload: {
            issueKey: issue.key,
            command: issue.remediation.command,
            description: issue.remediation.description,
          },
          riskLevel: issue.remediation.risk,
        });
        if (!deduped) {
          approvalsCreated += 1;
          await recordOperatorIncident({
            userId: ownerUserId,
            issue,
            outcome: "approval_requested",
            command: issue.remediation.command,
          });
          await recordAgentAction({
            tool: "healing",
            action: "create-approval",
            input: { issue: issue.key },
            output: { command: issue.remediation.command },
            status: "pending",
            riskLevel: issue.remediation.risk,
            reason: issue.remediation.description,
          });
          await notifyApprovalRequest({
            id,
            summary: issue.remediation.description,
            riskLevel: issue.remediation.risk,
          });
        }
      }

      if (issue.severity === "critical" || issue.severity === "error") {
        await notify({
          title: issue.title,
          body: `${issue.detail}${
            issue.remediation
              ? `\n\nSaran: ${issue.remediation.description}${issue.remediation.command ? `\nBalas SETUJU/TOLAK di WhatsApp atau approve di dashboard Operator.` : ""}`
              : "\n\nButuh perhatian manual."
          }`,
          level: severityToAgentEvent[issue.severity],
        });
        notified += 1;
      }
    })
  );

  return { approvalsCreated, notified };
}
