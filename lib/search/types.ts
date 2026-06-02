export type WebSearchSource = {
  title: string;
  url: string;
  snippet: string;
  favicon?: string;
  publishedDate?: string;
  score?: number;
};

export type WebSearchOutput = {
  query: string;
  sources: WebSearchSource[];
  provider: string;
  note?: string;
  /** Raw image results when the query has visual intent. */
  images?: RichImage[];
  /** True when this search was run against a news topic. */
  news?: boolean;
};

export type RichImage = {
  url: string;
  thumbnail?: string;
  title?: string;
  description?: string;
  sourceUrl?: string;
};

export type NewsCard = {
  title: string;
  url: string;
  source: string;
  favicon?: string;
  publishedDate?: string;
  snippet?: string;
  image?: string;
};

export type VideoCard = {
  title: string;
  url: string;
  thumbnail: string;
  source: string;
  channel?: string;
};

export type ProductCard = {
  title: string;
  url: string;
  image?: string;
  price?: string;
  rating?: number;
  source?: string;
};

export type LocationCard = {
  name: string;
  address?: string;
  description?: string;
  image?: string;
  lat?: number;
  lng?: number;
  mapUrl?: string;
};

export type WebsiteCard = {
  name: string;
  domain: string;
  url: string;
  description?: string;
  favicon?: string;
};

export type RichContent = {
  images?: RichImage[];
  news?: NewsCard[];
  videos?: VideoCard[];
  products?: ProductCard[];
  locations?: LocationCard[];
  websites?: WebsiteCard[];
  relatedQuestions?: string[];
};

export type ArticlePayload = {
  url: string;
  title: string;
  content: string;
  cached: boolean;
  fetchedAt: string;
};
