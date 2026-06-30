import { z } from "zod";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";
import {
  deleteVaultFile,
  getVaultFileById,
  updateVaultFileMeta,
} from "@/lib/vault/queries";
import { requireVaultSession } from "@/lib/vault/route-auth";
import { toVaultSnapshot } from "@/lib/vault/snapshot";

const patchSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  summary: z.string().max(500).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
});

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const vaultAuth = await requireVaultSession();
  if (vaultAuth instanceof ChatbotError) {
    return vaultAuth.toResponse();
  }

  const { id } = await params;
  const file = await getVaultFileById({
    userId: vaultAuth.vaultUserId,
    fileId: id,
  });
  if (!file) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json({
    file: toVaultSnapshot(file),
    downloadUrl: `/api/vault/${id}/download`,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const vaultAuth = await requireVaultSession();
  if (vaultAuth instanceof ChatbotError) {
    return vaultAuth.toResponse();
  }

  const { id } = await params;
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const file = await updateVaultFileMeta({
    userId: vaultAuth.vaultUserId,
    fileId: id,
    name: parsed.data.name,
    summary: parsed.data.summary,
    tags: parsed.data.tags,
  });

  if (!file) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json({ file });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const vaultAuth = await requireVaultSession();
  if (vaultAuth instanceof ChatbotError) {
    return vaultAuth.toResponse();
  }

  const { id } = await params;
  const removed = await deleteVaultFile({
    userId: vaultAuth.vaultUserId,
    fileId: id,
    ip: clientIp(request),
  });

  if (!removed) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
