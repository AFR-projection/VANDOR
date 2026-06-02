import "server-only";

import type { ContentIntents } from "./detect";
import type {
  NewsCard,
  ProductCard,
  RichContent,
  VideoCard,
  WebSearchOutput,
  WebsiteCard,
} from "./types";

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch {
    return;
  }
}

/** Turn "tavily.com" into "Tavily", "openai.com" into "Openai". */
function siteNameFromDomain(domain: string): string {
  const root = domain.split(".")[0] ?? domain;
  return root.charAt(0).toUpperCase() + root.slice(1);
}

const YOUTUBE_RE =
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/i;

function youtubeId(url: string): string | null {
  const match = YOUTUBE_RE.exec(url);
  return match?.[1] ?? null;
}

function buildWebsites(output: WebSearchOutput): WebsiteCard[] {
  const seen = new Set<string>();
  const cards: WebsiteCard[] = [];

  for (const source of output.sources) {
    const domain = hostname(source.url);
    if (seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    cards.push({
      name: siteNameFromDomain(domain),
      domain,
      url: source.url,
      description:
        source.snippet.length > 140
          ? `${source.snippet.slice(0, 140)}…`
          : source.snippet,
      favicon: source.favicon ?? faviconFor(source.url),
    });
    if (cards.length >= 4) {
      break;
    }
  }

  return cards;
}

function buildVideos(output: WebSearchOutput): VideoCard[] {
  const videos: VideoCard[] = [];
  const seen = new Set<string>();

  for (const source of output.sources) {
    const id = youtubeId(source.url);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    videos.push({
      title: source.title,
      url: source.url,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      source: "YouTube",
    });
  }

  return videos;
}

function buildNews(output: WebSearchOutput): NewsCard[] {
  return output.sources.map((source, index) => ({
    title: source.title,
    url: source.url,
    source: hostname(source.url),
    favicon: source.favicon ?? faviconFor(source.url),
    publishedDate: source.publishedDate,
    snippet:
      source.snippet.length > 220
        ? `${source.snippet.slice(0, 220)}…`
        : source.snippet,
    image: output.images?.[index]?.url,
  }));
}

const SHOPPING_DOMAINS = [
  "tokopedia",
  "shopee",
  "bukalapak",
  "lazada",
  "blibli",
  "amazon",
  "ebay",
  "aliexpress",
  "digimap",
  "ibox",
];

const PRICE_RE =
  /(?:Rp\.?\s?[\d.,]+(?:\s?(?:juta|jt|ribu|rb))?|\$\s?[\d.,]+|US\$\s?[\d.,]+|€\s?[\d.,]+)/i;

function buildProducts(output: WebSearchOutput): ProductCard[] {
  const products: ProductCard[] = [];

  output.sources.forEach((source, index) => {
    const domain = hostname(source.url);
    const isShop = SHOPPING_DOMAINS.some((d) => domain.includes(d));
    if (!isShop) {
      return;
    }
    const priceMatch = PRICE_RE.exec(source.snippet)?.[0];
    products.push({
      title: source.title,
      url: source.url,
      image: output.images?.[index]?.url,
      price: priceMatch?.trim(),
      source: siteNameFromDomain(domain),
    });
  });

  return products;
}

export function buildRichContent(
  output: WebSearchOutput,
  intents: ContentIntents
): RichContent {
  const rich: RichContent = {};

  if (intents.news && output.news) {
    rich.news = buildNews(output);
  }

  if (intents.website) {
    rich.websites = buildWebsites(output);
  }

  if (intents.images && output.images && output.images.length > 0) {
    rich.images = output.images.slice(0, 9);
  }

  if (intents.video) {
    const videos = buildVideos(output);
    if (videos.length > 0) {
      rich.videos = videos;
    }
  }

  if (intents.product) {
    const products = buildProducts(output);
    if (products.length > 0) {
      rich.products = products;
    }
  }

  return rich;
}

export function hasRichContent(rich: RichContent): boolean {
  return Boolean(
    rich.images?.length ||
      rich.news?.length ||
      rich.videos?.length ||
      rich.products?.length ||
      rich.locations?.length ||
      rich.websites?.length ||
      rich.relatedQuestions?.length
  );
}
