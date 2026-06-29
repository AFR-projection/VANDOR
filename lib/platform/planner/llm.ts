type ChatOptions = {
  apiKey: string;
  modelId: string;
  appUrl?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
};

export async function platformLlmChat(
  prompt: string,
  options: ChatOptions
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 35_000
  );

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        ...(options.appUrl ? { "HTTP-Referer": options.appUrl } : {}),
        "X-Title": "VANDOR Platform Planner",
      },
      body: JSON.stringify({
        model: options.modelId,
        temperature: options.temperature ?? 0.15,
        max_tokens: options.maxTokens ?? 1200,
        messages: [
          ...(options.system
            ? [{ role: "system", content: options.system }]
            : []),
          { role: "user", content: prompt },
        ],
      }),
    });

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

export async function platformLlmJson<T>(
  prompt: string,
  options: ChatOptions
): Promise<T | null> {
  const text = await platformLlmChat(prompt, options);
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
