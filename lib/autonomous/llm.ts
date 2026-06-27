import { autonomousConfig } from "./config";

export function isLlmConfigured(): boolean {
  return autonomousConfig.openrouterApiKey.length > 0;
}

type ChatOptions = {
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

/** Panggil OpenRouter chat completion. Return teks atau null bila gagal. */
export async function llmChat(
  prompt: string,
  options: ChatOptions = {}
): Promise<string | null> {
  if (!isLlmConfigured()) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 30_000
  );

  try {
    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${autonomousConfig.openrouterApiKey}`,
          ...(autonomousConfig.appUrl
            ? { "HTTP-Referer": autonomousConfig.appUrl }
            : {}),
          "X-Title": "VANDOR Autonomous",
        },
        body: JSON.stringify({
          model: autonomousConfig.plannerModel,
          temperature: options.temperature ?? 0.2,
          max_tokens: options.maxTokens ?? 800,
          messages: [
            ...(options.system
              ? [{ role: "system", content: options.system }]
              : []),
            { role: "user", content: prompt },
          ],
        }),
      }
    );

    if (!res.ok) {
      return null;
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Panggil LLM dan parse JSON dari respons (toleran terhadap code fence). */
export async function llmJson<T = unknown>(
  prompt: string,
  options: ChatOptions = {}
): Promise<T | null> {
  const text = await llmChat(prompt, options);
  if (!text) {
    return null;
  }
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
