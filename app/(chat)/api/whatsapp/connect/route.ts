import { waitUntil } from "@vercel/functions";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { isWhatsappServerlessHost } from "@/lib/whatsapp/auth-path";
import {
  connectWhatsapp,
  waitForWhatsappPublicState,
} from "@/lib/whatsapp/manager";

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const sessionWork = connectWhatsapp({
    holdMs: isWhatsappServerlessHost() ? 110_000 : 0,
  });
  waitUntil(sessionWork);

  const state = await waitForWhatsappPublicState(55_000);
  return NextResponse.json({
    ...state,
    deployment: { serverless: isWhatsappServerlessHost() },
  });
}
