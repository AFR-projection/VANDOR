import {
  approvalShortId,
  listPendingApprovals,
} from "./permission";
import { notify } from "./notify";

let lastDigestAt = 0;
const DIGEST_COOLDOWN_MS = 10 * 60_000;

function formatDigest(
  rows: Awaited<ReturnType<typeof listPendingApprovals>>
): string {
  const lines = rows.map((row, i) => {
    const short = approvalShortId(row.id);
    return (
      `${i + 1}. *[${row.riskLevel.toUpperCase()}]* ${row.summary.slice(0, 120)}\n` +
      `   ✅ SETUJU ${short}  ·  ❌ TOLAK ${short}`
    );
  });
  return (
    `📋 *${rows.length} persetujuan menunggu:*\n\n` +
    `${lines.join("\n\n")}\n\n` +
    `Atau buka Pengaturan → Operator di web.`
  );
}

/** Kirim ringkasan approval pending ke WhatsApp owner utama (web process via internal API). */
export async function sendPendingApprovalsDigest(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const pending = await listPendingApprovals(10);
  if (pending.length === 0) {
    return { ok: true, count: 0 };
  }

  await notify({
    title: "Persetujuan Operator",
    body: formatDigest(pending),
    level: "warn",
  });

  return { ok: true, count: pending.length };
}

/**
 * Debounced digest — dipanggil tiap tick worker supaya approval tidak cuma di web.
 * Cooldown 10 menit agar tidak spam WA.
 */
export async function maybeNotifyPendingApprovals(): Promise<void> {
  const now = Date.now();
  if (now - lastDigestAt < DIGEST_COOLDOWN_MS) {
    return;
  }
  const pending = await listPendingApprovals(1);
  if (pending.length === 0) {
    return;
  }
  lastDigestAt = now;
  await sendPendingApprovalsDigest();
}
