import { auth } from "@/app/(auth)/auth";
import { getOrExtractArticle } from "@/lib/search/extract-article";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter url is required"
    ).toResponse();
  }

  try {
    const article = await getOrExtractArticle(url);
    return Response.json(article, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load article";
    return Response.json({ error: message }, { status: 422 });
  }
}
