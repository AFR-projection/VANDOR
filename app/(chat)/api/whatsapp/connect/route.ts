import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { connectWhatsapp } from "@/lib/whatsapp/manager";

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

  const state = await connectWhatsapp();
  return NextResponse.json(state);
}
