import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import { classify, isMimeAllowed, MAX_UPLOAD_BYTES } from "@/lib/files/mime";
import { putFile } from "@/lib/storage/blob";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session) {
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

    const originalName = (file as File).name ?? `upload-${Date.now()}`;
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
    const buffer = await file.arrayBuffer();

    try {
      const stored = await putFile(safeName, buffer, {
        contentType: mime,
        addRandomSuffix: true,
      });

      return NextResponse.json({
        url: stored.url,
        pathname: stored.pathname,
        contentType: mime,
        name: safeName,
        kind,
        size: file.size,
        backend: stored.backend,
      });
    } catch (error) {
      console.error("Upload failed:", error);
      const msg = error instanceof Error ? error.message : "Upload failed";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
