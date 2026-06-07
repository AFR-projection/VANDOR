import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { classify, isMimeAllowed, MAX_UPLOAD_BYTES } from "@/lib/files/mime";
import { requireClientAccess } from "@/lib/security/client-access";
import { storeVaultFile } from "@/lib/vault/store";

export const maxDuration = 60;

function clientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    undefined
  );
}

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as Blob | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const originalName = (file as File).name ?? `vault-${Date.now()}`;
    const mime = file.type || "application/octet-stream";

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          error: `File terlalu besar. Maks ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
        },
        { status: 413 }
      );
    }

    if (!isMimeAllowed(mime)) {
      return NextResponse.json(
        { error: `Tipe file tidak didukung: ${mime}` },
        { status: 415 }
      );
    }

    const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const kind = classify(mime, originalName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const tagsRaw = formData.get("tags");
    const summaryRaw = formData.get("summary");
    const tags =
      typeof tagsRaw === "string" && tagsRaw.trim()
        ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined;
    const summary =
      typeof summaryRaw === "string" && summaryRaw.trim()
        ? summaryRaw.trim()
        : undefined;

    const stored = await storeVaultFile({
      userId: session.user.id,
      fileName: safeName,
      mimeType: mime,
      fileType: kind,
      data: buffer,
      summary,
      tags,
      sourceType: "upload",
      ip: clientIp(request),
    });

    if (!stored.ok) {
      return NextResponse.json({ error: stored.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      vaultFileId: stored.file.id,
      file: stored.file,
    });
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process vault upload" },
      { status: 500 }
    );
  }
}
