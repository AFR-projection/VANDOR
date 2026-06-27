import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { isWhatsappServerlessHost } from "@/lib/whatsapp/auth-path";
import { getWhatsappPublicState } from "@/lib/whatsapp/manager";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const state = await getWhatsappPublicState();
  return NextResponse.json({
    ...state,
    deployment: {
      serverless: isWhatsappServerlessHost(),
    },
  });
}
