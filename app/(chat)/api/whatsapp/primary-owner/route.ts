import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { z } from "zod";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import { getUserSettings, updateUserSettings } from "@/lib/settings/queries";
import { normalizeWhatsappNumber, validateGlobalPhoneInput } from "@/lib/whatsapp/phone";
import { resolveDeploymentOwnerUser } from "@/lib/whatsapp/deployment-owner";

export const maxDuration = 15;

const patchSchema = z.object({
  phone: z.string().max(32),
});

/** GET — nomor owner utama untuk alert Operator */
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

  const settings = await getUserSettings(ownerUser.id);
  const phone = normalizeWhatsappNumber(
    settings.integrations.whatsappPrimaryOwner
  );
  return NextResponse.json({
    primaryOwner: phone.length >= 6 ? phone : "",
  });
}

/** PATCH — simpan owner utama */
export async function PATCH(request: Request) {
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

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Body tidak valid." }, { status: 400 });
  }

  const settings = await getUserSettings(ownerUser.id);
  const validated = validateGlobalPhoneInput(body.phone);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const normalized = validated.normalized;

  await updateUserSettings(ownerUser.id, {
    integrations: {
      ...settings.integrations,
      whatsappPrimaryOwner: normalized.length >= 6 ? normalized : "",
    },
  });

  return NextResponse.json({
    ok: true,
    primaryOwner: normalized.length >= 6 ? normalized : "",
  });
}
