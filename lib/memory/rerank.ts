import "server-only";

import { openRouterFetch } from "@/lib/ai/openrouter-http";
import type { OpenRouterUserContext } from "@/lib/ai/integration-models";

type RerankResult = {
  index: number;
  relevance_score?: number;
};

type RerankResponse = {
  results?: RerankResult[];
  error?: { message?: string };
};

export async function rerankDocuments<T extends { content: string }>({
  ctx,
  model,
  query,
  documents,
}: {
  ctx: OpenRouterUserContext;
  model: string;
  query: string;
  documents: T[];
}): Promise<T[]> {
  if (!model.trim() || documents.length < 2) {
    return documents;
  }

  const result = await openRouterFetch<RerankResponse>({
    ctx,
    path: "/rerank",
    body: {
      model,
      query,
      documents: documents.map((d) => d.content),
    },
  });

  if (!result.ok || !result.data.results?.length) {
    return documents;
  }

  const ordered = [...result.data.results].sort(
    (a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0)
  );

  return ordered
    .map((r) => documents[r.index])
    .filter((d): d is T => Boolean(d));
}
