import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";
import {
  cleanupOrphanLidOwners,
  getActiveOwnersForDisplay,
  revokeWhatsappOwner,
} from "@/lib/whatsapp/queries";

export const maxDuration = 15;

/** GET — list all active verified owner numbers for this user */
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

  await cleanupOrphanLidOwners(ownerUser.id);
  const owners = await getActiveOwnersForDisplay(ownerUser.id);
  return NextResponse.json({ owners });
}

/** DELETE — revoke a verified number (body: { phone: string }) */
export async function DELETE(request: Request) {
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

  let phone: string;
  try {
    const body = (await request.json()) as { phone?: string };
    phone = (body.phone ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  if (!phone) {
    return NextResponse.json({ error: "Field phone wajib diisi." }, { status: 400 });
  }

  await revokeWhatsappOwner(ownerUser.id, phone);
  return NextResponse.json({ ok: true });
}
