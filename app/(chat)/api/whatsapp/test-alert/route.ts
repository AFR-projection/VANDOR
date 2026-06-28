import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { sendSystemWhatsappNotification } from "@/lib/whatsapp/manager";

export const maxDuration = 15;

/** POST — kirim alert test ke owner utama (verifikasi notifikasi Operator). */
export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const result = await sendSystemWhatsappNotification(
    "🔔 *Test alert VANDOR Operator*\n\nJika kamu menerima pesan ini, notifikasi WA owner utama berfungsi."
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Gagal mengirim" },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sentTo: result.sentTo,
    target: result.target,
  });
}
