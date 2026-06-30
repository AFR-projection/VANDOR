import { auth } from "@/app/(auth)/auth";
import {
  createApiKey,
  deleteApiKey,
  listApiKeys,
  publicApiKeyView,
} from "@/lib/agent-skills/queries";
import { createApiKeySchema } from "@/lib/agent-skills/validation";
import { ChatbotError } from "@/lib/errors";
import { requireClientAccess } from "@/lib/security/client-access";

export async function GET(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const keys = await listApiKeys(session.user.id);
  return Response.json({ keys: keys.map(publicApiKeyView) });
}

export async function POST(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const parsed = createApiKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Data API key tidak valid" },
      { status: 400 }
    );
  }

  const key = await createApiKey(
    session.user.id,
    parsed.data.name,
    parsed.data.value
  );
  return Response.json({ key: publicApiKeyView(key) }, { status: 201 });
}

export async function DELETE(request: Request) {
  const denied = await requireClientAccess(request);
  if (denied) return denied;

  const session = await auth();
  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id wajib" }, { status: 400 });
  }

  await deleteApiKey(session.user.id, id);
  return Response.json({ ok: true });
}
