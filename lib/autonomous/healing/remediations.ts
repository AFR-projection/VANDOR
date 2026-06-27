import { recordAgentAction } from "../audit";
import { emitEvent } from "../events";
import { notify } from "../notify";
import { createApproval } from "../permission";
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

  await Promise.all(
    issues.map(async (issue) => {
      await emitEvent({
        type: "issue",
        severity: severityToAgentEvent[issue.severity],
        source: "detector",
        message: `${issue.title} — ${issue.detail}`.slice(0, 1000),
        payload: { key: issue.key, remediation: issue.remediation ?? null },
      });

      if (issue.remediation?.command) {
        const { deduped } = await createApproval({
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
          await recordAgentAction({
            tool: "healing",
            action: "create-approval",
            input: { issue: issue.key },
            output: { command: issue.remediation.command },
            status: "pending",
            riskLevel: issue.remediation.risk,
            reason: issue.remediation.description,
          });
        }
      }

      if (issue.severity === "critical" || issue.severity === "error") {
        await notify({
          title: issue.title,
          body: `${issue.detail}${
            issue.remediation
              ? `\n\nSaran: ${issue.remediation.description}${issue.remediation.command ? `\nButuh approval di dashboard Operator.` : ""}`
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
