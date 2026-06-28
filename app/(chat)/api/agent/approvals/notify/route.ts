import { auth } from "@/app/(auth)/auth";
import { sendPendingApprovalsDigest } from "@/lib/autonomous/approval-notify";
import { requireClientAccess } from "@/lib/security/client-access";
import { sendSystemWhatsappNotification } from "@/lib/whatsapp/manager";
import {
  approvalShortId,
  listPendingApprovals,
} from "@/lib/autonomous/permission";

/** POST — kirim digest approval pending langsung ke WhatsApp (tanpa worker). */
export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pending = await listPendingApprovals(10);
  if (pending.length === 0) {
    return Response.json({ ok: true, count: 0, message: "Tidak ada approval pending" });
  }

  const lines = pending.map((row, i) => {
    const short = approvalShortId(row.id);
    return (
      `${i + 1}. [${row.riskLevel.toUpperCase()}] ${row.summary.slice(0, 120)}\n` +
      `SETUJU ${short} / TOLAK ${short}`
    );
  });

  const text =
    `📋 *${pending.length} persetujuan Operator menunggu:*\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `Balas *SETUJU <kode>* atau *TOLAK <kode>* dari WhatsApp ini.`;

  const direct = await sendSystemWhatsappNotification(text);
  if (direct.ok) {
    return Response.json({
      ok: true,
      count: pending.length,
      sentTo: direct.sentTo,
      target: direct.target,
    });
  }

  const fallback = await sendPendingApprovalsDigest();
  return Response.json(
    {
      ok: fallback.ok,
      count: fallback.count,
      error: direct.error ?? "Gagal kirim ke WhatsApp",
    },
    { status: fallback.ok ? 200 : 502 }
  );
}
