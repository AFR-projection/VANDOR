import { NextResponse } from "next/server";
import { ensureOwnerUser } from "@/lib/db/ensure-owner";
import { getUser } from "@/lib/db/queries";
import { ChatbotError } from "@/lib/errors";
import { getOwnerCredentials } from "@/lib/security/gate";
import {
  deriveWhatsappChatId,
  getBridgeSecret,
  isOwnerWhatsappNumber,
} from "@/lib/whatsapp/config";
import { runWhatsappAgentTurn } from "@/lib/whatsapp/run-agent-turn";

export const maxDuration = 60;

type IngestBody = {
  from?: string;
  text?: string;
  name?: string;
};

function unauthorized(message: string) {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function POST(request: Request) {
  const secret = getBridgeSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "WHATSAPP_BRIDGE_SECRET belum dikonfigurasi di server." },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== secret) {
    return unauthorized("Bridge secret tidak valid.");
  }

  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, {
      status: 400,
    });
  }

  const from = (body.from ?? "").trim();
  const text = (body.text ?? "").trim();

  if (!(from && text)) {
    return NextResponse.json(
      { error: "Field 'from' dan 'text' wajib diisi." },
      { status: 400 }
    );
  }

  if (!isOwnerWhatsappNumber(from)) {
    // Silently ignore non-owner numbers — bot only serves the owner.
    return NextResponse.json({ ignored: true, reason: "not_owner" });
  }

  const owner = getOwnerCredentials();
  if (!owner) {
    return NextResponse.json(
      { error: "VANDOR_OWNER_EMAIL/PASSWORD belum diset." },
      { status: 503 }
    );
  }

  try {
    await ensureOwnerUser();
    const [ownerUser] = await getUser(owner.email);
    if (!ownerUser) {
      return NextResponse.json(
        { error: "Owner user tidak ditemukan." },
        { status: 500 }
      );
    }

    const chatId = deriveWhatsappChatId(from);
    const { reply } = await runWhatsappAgentTurn({
      userId: ownerUser.id,
      chatId,
      text,
      senderName: body.name,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    const message =
      error instanceof ChatbotError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Gagal memproses pesan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
