import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import {
  createVerifCode,
  getActiveCode,
  getVerifLogs,
} from "@/lib/whatsapp/queries";

export const maxDuration = 15;

/** GET — return active code (if any) + audit log */
export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const ownerUser = await resolveDeploymentOwnerUser();
  if (!ownerUser) {
    return NextResponse.json(
      { error: "VANDOR_OWNER_EMAIL belum dikonfigurasi." },
      { status: 503 }
    );
  }

  const [active, logs] = await Promise.all([
    getActiveCode(ownerUser.id),
    getVerifLogs(ownerUser.id, 20),
  ]);

  return NextResponse.json({ active, logs });
}

/** POST — generate a new code (invalidates previous active ones implicitly via expiry) */
export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) {
    return denied;
  }
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const ownerUser = await resolveDeploymentOwnerUser();
  if (!ownerUser) {
    return NextResponse.json(
      { error: "VANDOR_OWNER_EMAIL belum dikonfigurasi." },
      { status: 503 }
    );
  }

  const code = await createVerifCode(ownerUser.id);
  return NextResponse.json({ code });
}
