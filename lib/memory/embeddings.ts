import "server-only";

const EMBEDDING_DIMENSIONS = 1536;

export type EmbedTextOptions = {
  apiKey?: string;
  model?: string;
};

export async function embedText(
  text: string,
  opts?: EmbedTextOptions
): Promise<number[]> {
  const apiKey =
    opts?.apiKey?.trim() || process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OpenRouter API key is required for memory embeddings");
  }

  const model =
    opts?.model?.trim() ||
    process.env.MEMORY_EMBEDDING_MODEL?.trim() ||
    "openai/text-embedding-3-small";

  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 8000),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding failed: ${res.status} ${err}`);
  }

  const json = await res.json();
  const embedding = json.data?.[0]?.embedding as number[] | undefined;
  if (!embedding?.length) {
    throw new Error("Empty embedding response");
  }

  return embedding;
}

export function embeddingToSql(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

export { EMBEDDING_DIMENSIONS };
