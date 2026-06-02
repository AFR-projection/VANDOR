import "server-only";

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import {
  getCachedArticle,
  normalizeArticleUrl,
  saveArticleToCache,
} from "./article-cache";
import type { ArticlePayload } from "./types";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VANDOR/1.0; +https://vandor.ai) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch page (${res.status})`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("xml")) {
      throw new Error("URL is not an HTML page");
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_HTML_BYTES) {
      throw new Error("Page too large to extract");
    }

    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } finally {
    clearTimeout(timeout);
  }
}

function extractReadableContent(html: string, url: string) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (article?.textContent?.trim()) {
    return {
      title: article.title?.trim() || new URL(url).hostname,
      content: article.textContent.trim(),
    };
  }

  const bodyText = dom.window.document.body?.textContent?.trim() ?? "";
  if (bodyText.length > 100) {
    return {
      title: dom.window.document.title?.trim() || new URL(url).hostname,
      content: bodyText.slice(0, 50_000),
    };
  }

  const fallback = stripHtml(html);
  if (fallback.length < 50) {
    throw new Error("Could not extract readable content from this page");
  }

  return {
    title: dom.window.document.title?.trim() || new URL(url).hostname,
    content: fallback.slice(0, 50_000),
  };
}

export async function getOrExtractArticle(
  rawUrl: string
): Promise<ArticlePayload> {
  const url = normalizeArticleUrl(rawUrl);

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Invalid URL");
  }

  const cached = await getCachedArticle(url);
  if (cached) {
    return {
      url: cached.url,
      title: cached.title,
      content: cached.content,
      cached: true,
      fetchedAt: cached.fetchedAt.toISOString(),
    };
  }

  const html = await fetchPageHtml(url);
  const { title, content } = extractReadableContent(html, url);

  await saveArticleToCache({ url, title, content });

  return {
    url,
    title,
    content,
    cached: false,
    fetchedAt: new Date().toISOString(),
  };
}
