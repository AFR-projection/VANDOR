import "server-only";

import {
  approvalShortId,
  decideApproval,
  findPendingApprovalByShortId,
  listPendingApprovals,
  resumeApprovedTask,
} from "@/lib/autonomous/permission";
import {
  getPrimaryWhatsappOwner,
  isPrimaryWhatsappSender,
  normalizeWhatsappNumber,
} from "./config";
import type { SenderIdentity } from "./sender-identity";

const APPROVE_RE =
  /^(?:setuju|approve|ya|ok|ijin|izin)(?:\s+([a-f0-9]{4,8}))?$/i;
const REJECT_RE =
  /^(?:tolak|reject|tidak|batal|no|n)(?:\s+([a-f0-9]{4,8}))?$/i;
const LIST_RE = /^(?:antrian|pending|approval|persetujuan)$/i;

export type OperatorCommandResult = {
  handled: boolean;
  reply?: string;
};

async function canUseOperatorCommands(
  identity: SenderIdentity
): Promise<boolean> {
  const primary = await getPrimaryWhatsappOwner();
  if (primary) {
    return isPrimaryWhatsappSender({
      phone: identity.phone,
      lid: identity.lid,
    });
  }
  return true;
}

function formatPendingList(
  rows: Awaited<ReturnType<typeof listPendingApprovals>>
): string {
  if (rows.length === 0) {
    return "✅ Tidak ada persetujuan menunggu.";
  }
  const lines = rows.slice(0, 5).map((row, i) => {
    const short = approvalShortId(row.id);
    return `${i + 1}. [${short}] ${row.summary.slice(0, 120)}`;
  });
  return (
    `📋 *${rows.length} persetujuan menunggu:*\n\n` +
    `${lines.join("\n")}\n\n` +
    `Balas: *SETUJU <kode>* atau *TOLAK <kode>*`
  );
}

/**
 * Tangani perintah Operator via WhatsApp (setuju/tolak/antrian).
 * Hanya owner utama (jika diset) yang boleh approve.
 */
export async function handleOperatorWhatsappCommand(
  text: string,
  identity: SenderIdentity
): Promise<OperatorCommandResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { handled: false };
  }

  const allowed = await canUseOperatorCommands(identity);
  if (!allowed) {
    if (APPROVE_RE.test(trimmed) || REJECT_RE.test(trimmed) || LIST_RE.test(trimmed)) {
      const primary = await getPrimaryWhatsappOwner();
      return {
        handled: true,
        reply:
          `🔒 Perintah Operator hanya untuk *owner utama* (+${primary ?? "?"}).\n\n` +
          `Atur di Pengaturan → WhatsApp → Owner Utama.`,
      };
    }
    return { handled: false };
  }

  if (LIST_RE.test(trimmed)) {
    const pending = await listPendingApprovals(10);
    return { handled: true, reply: formatPendingList(pending) };
  }

  const approveMatch = APPROVE_RE.exec(trimmed);
  if (approveMatch) {
    return resolveDecision("approved", approveMatch[1], identity);
  }

  const rejectMatch = REJECT_RE.exec(trimmed);
  if (rejectMatch) {
    return resolveDecision("rejected", rejectMatch[1], identity);
  }

  return { handled: false };
}

async function resolveDecision(
  decision: "approved" | "rejected",
  shortId: string | undefined,
  identity: SenderIdentity
): Promise<OperatorCommandResult> {
  let approval = shortId
    ? await findPendingApprovalByShortId(shortId)
    : null;

  if (!approval) {
    const pending = await listPendingApprovals(10);
    if (pending.length === 1 && !shortId) {
      approval = pending[0];
    } else if (pending.length === 0) {
      return {
        handled: true,
        reply: "ℹ️ Tidak ada persetujuan yang menunggu.",
      };
    } else {
      return {
        handled: true,
        reply:
          `⚠️ Beberapa persetujuan menunggu — sebut kode:\n\n${formatPendingList(pending)}`,
      };
    }
  }

  const decidedBy = identity.phone
    ? `wa:+${normalizeWhatsappNumber(identity.phone)}`
    : "whatsapp-owner";

  const ok = await decideApproval(approval.id, decision, decidedBy);
  if (!ok) {
    return {
      handled: true,
      reply: "❌ Persetujuan tidak ditemukan atau sudah diproses.",
    };
  }

  if (decision === "approved") {
    await resumeApprovedTask(approval.id);
  }

  const emoji = decision === "approved" ? "✅" : "❌";
  const verb = decision === "approved" ? "DISETUJUI" : "DITOLAK";
  return {
    handled: true,
    reply:
      `${emoji} *${verb}* [${approvalShortId(approval.id)}]\n\n` +
      `${approval.summary.slice(0, 300)}\n\n` +
      (decision === "approved"
        ? "Worker akan menjalankan aksi pada tick berikutnya."
        : "Aksi dibatalkan."),
  };
}
