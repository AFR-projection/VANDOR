import "server-only";

import type { RichImage, WebSearchOutput, WebSearchSource } from "./types";
import { getCachedWebSearch, setCachedWebSearch } from "./web-cache";

export type SearchIntents = {
  images?: boolean;
  news?: boolean;
};

export type RunWebSearchOptions = {
  maxResults?: number;
  intents?: SearchIntents;
  userId?: string;
};

function faviconFor(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return;
  }
}

type TavilyResult = {
  title?: string;
  content?: string;
  url: string;
  favicon?: string;
  published_date?: string;
  score?: number;
};

type TavilyImage = string | { url: string; description?: string };

async function tavilySearch(
  query: string,
  apiKey: string,
  maxResults: number,
  intents: SearchIntents
): Promise<{ sources: WebSearchSource[]; images: RichImage[]; news: boolean }> {
  const body: Record<string, unknown> = {
    api_key: apiKey,
    query,
    max_results: Math.min(maxResults, 6),
    search_depth: "advanced",
    include_answer: false,
    include_raw_content: false,
    include_favicon: true,
  };

  if (intents.images) {
    body.include_images = true;
    body.include_image_descriptions = true;
  }

  if (intents.news) {
    body.topic = "news";
    body.days = 7;
  }

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Tavily error: ${res.status}`);
  }

  const data = await res.json();

  const sources: WebSearchSource[] = (data.results ?? [])
    .slice(0, 6)
    .map((r: TavilyResult): WebSearchSource => ({
      title: r.title?.trim() || r.url,
      snippet: r.content?.trim() ?? "",
      url: r.url,
      favicon: r.favicon || faviconFor(r.url),
      publishedDate: r.published_date,
      score: r.score,
    }))
    .filter((s: WebSearchSource) => s.url.startsWith("http"));

  const images: RichImage[] = (data.images ?? [])
    .map((img: TavilyImage): RichImage | null => {
      if (typeof img === "string") {
        return img.startsWith("http") ? { url: img } : null;
      }
      if (img?.url?.startsWith("http")) {
        return { url: img.url, description: img.description };
      }
      return null;
    })
    .filter((img: RichImage | null): img is RichImage => img !== null)
    .slice(0, 12);

  return { sources, images, news: Boolean(intents.news) };
}

async function duckDuckGoInstant(query: string): Promise<WebSearchSource[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "VANDOR/1.0" },
    });
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    const results: WebSearchSource[] = [];

    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading ?? query,
        snippet: data.AbstractText,
        url: data.AbstractURL,
        favicon: faviconFor(data.AbstractURL),
      });
    }

    for (const topic of data.RelatedTopics ?? []) {
      if (topic.Text && topic.FirstURL) {
        results.push({
          title: topic.Text.split(" - ")[0] ?? topic.Text,
          snippet: topic.Text,
          url: topic.FirstURL,
          favicon: faviconFor(topic.FirstURL),
        });
      }
      if (results.length >= 5) {
        break;
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function wikipediaSearch(
  query: string,
  maxResults: number
): Promise<WebSearchSource[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&format=json&srlimit=${maxResults}&origin=*`;
    const res = await fetch(url);
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return (data.query?.search ?? []).map(
      (item: { title: string; snippet: string }) => {
        const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(
          item.title.replace(/ /g, "_")
        )}`;
        return {
          title: item.title,
          snippet: item.snippet.replace(/<[^>]+>/g, ""),
          url: articleUrl,
          favicon: faviconFor(articleUrl),
        };
      }
    );
  } catch {
    return [];
  }
}

function normalizeOptions(
  options?: RunWebSearchOptions | number
): RunWebSearchOptions {
  if (typeof options === "number") {
    return { maxResults: options };
  }
  return options ?? {};
}

export async function runWebSearch(
  query: string,
  options?: RunWebSearchOptions | number
): Promise<WebSearchOutput> {
  const { maxResults = 5, intents = {}, userId } = normalizeOptions(options);
  const limit = Math.min(Math.max(maxResults, 3), 6);

  // The cache schema only persists sources/provider, so it can't round-trip
  // images or the news flag. Bypass it entirely for visual/news searches.
  const useCache = !(intents.images || intents.news);

  if (useCache) {
    const cached = await getCachedWebSearch(query);
    if (cached) {
      return cached;
    }
  }

  let tavilyKey = process.env.TAVILY_API_KEY?.trim() || null;
  if (userId) {
    const { getTavilyApiKey } = await import("@/lib/settings/secrets-queries");
    tavilyKey = (await getTavilyApiKey(userId)) ?? tavilyKey;
  }

  if (tavilyKey) {
    try {
      const { sources, images, news } = await tavilySearch(
        query,
        tavilyKey,
        limit,
        intents
      );
      if (sources.length > 0) {
        const result: WebSearchOutput = {
          query,
          sources,
          provider: news ? "tavily-news" : "tavily",
          ...(images.length > 0 && { images }),
          ...(news && { news: true }),
        };
        if (useCache) {
          await setCachedWebSearch(result);
        }
        return result;
      }
    } catch {
      /* fall through */
    }
  }

  const [ddg, wiki] = await Promise.all([
    duckDuckGoInstant(query),
    wikipediaSearch(query, Math.max(2, limit - 2)),
  ]);

  const combined = [...ddg, ...wiki].slice(0, limit);

  if (combined.length === 0) {
    return {
      query,
      sources: [],
      provider: "none",
      note: "No results found.",
    };
  }

  const result: WebSearchOutput = {
    query,
    sources: combined,
    provider: "duckduckgo+wikipedia",
  };
  if (useCache) {
    await setCachedWebSearch(result);
  }
  return result;
}
