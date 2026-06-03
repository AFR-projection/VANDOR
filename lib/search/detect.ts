// ── Never search: greetings, generation, meta/identity, trivial tasks ───────
const SKIP_PATTERNS = [
  /^(hi|halo|hello|hey|thanks|thank you|terima kasih|makasih|ok|oke|sip|noted|good|bagus|mantap)\s*[!.?]*$/i,
  /^(write|buatkan|generate|create)\s+(me\s+)?(a\s+)?(code|script|function|program|gambar|image|logo|pdf|docx)/i,
  /^\/\w+/,
  // Image generation / editing (handled by generateImage / editImage tools)
  /\b(edit|edot|editan|photoshop|manipulasi|inpaint|ganti background|ubah foto|ubah gambar|retouch|airbrush)\b/i,
  /\b(buatkan gambar|generate image|draw|gambarin|ilustrasi|logo)\b/i,
  // Identity / meta about the assistant
  /\b(siapa kamu|siapa anda|kamu siapa|who are you|nama kamu|kamu bisa apa|apa yang bisa kamu|what can you do|apa kabar|how are you|kabar kamu)\b/i,
  // Time / date (handled by getCurrentTime tool)
  /\b(jam berapa|pukul berapa|what time|tanggal berapa|hari apa|what day|sekarang jam)\b/i,
  // Pure arithmetic
  /\d\s*[+\-*/×÷^]\s*\d/,
  // Local content tasks on text the user supplied (no external info needed)
  /\b(translate|terjemah(kan)?|ringkas(kan|an)?|rangkum(kan)?|summarize|summary|rewrite|tulis ulang|parafrase|paraphrase|koreksi|perbaiki (kalimat|tata bahasa|grammar|ejaan))\b/i,
];

// ── Strong signals that genuinely require external / current information ─────
const SEARCH_TRIGGERS = [
  // Recency
  /\b(terbaru|terkini|latest|current|hari ini|kemarin|besok|tahun ini|this year|minggu ini|bulan ini|this week|this month|baru saja|barusan)\b/i,
  // News
  /\b(berita|news|headline|breaking|kabar terbaru|viral|trending|gosip)\b/i,
  // Commerce / pricing
  /\b(harga|price|cost|biaya|tarif|fee|beli|buy|diskon|promo|murah|mahal|langganan|subscription|jual|olshop|e-commerce)\b/i,
  // Comparison
  /\b(bandingkan|compare|comparison|perbandingan|vs\.?|versus)\b/i,
  // Reviews / specs
  /\b(review|ulasan|rating|spesifikasi|spek|spec|benchmark|unboxing|testimoni)\b/i,
  // Finance
  /\b(saham|stock|crypto|bitcoin|ethereum|forex|kurs|nilai tukar|harga emas|gold price)\b/i,
  // Releases / events
  /\b(rilis|release|launch|launching|announce|announced|dirilis|kapan rilis|kapan keluar|jadwal)\b/i,
  // Explicit search requests
  /\b(cari(kan)?|search|google|googling|telusuri|browsing|cek di (internet|web|google))\b/i,
  // Recommendations & local discovery
  /\b(rekomendasi|recommend|paling (bagus|baik)|tempat (makan|wisata|nongkrong|menarik)|restoran|hotel|penginapan|cafe|kafe|kuliner|destinasi|wisata|near me|terdekat)\b/i,
  // Explicit years (2010-2029)
  /\b20[12]\d\b/,
];

// ── Strong visual intent → image search (must be explicit) ───────────────────
const STRONG_VISUAL = [
  /\b(foto|gambar|photo|picture|images?|wallpaper|penampakan|pemandangan)\b/i,
  /\b(tampilkan|tampilin|tunjukkan|tunjukin|show me)\b.*\b(foto|gambar|photo|picture|wujud|bentuk|rupa)\b/i,
  /\bseperti apa (bentuk|rupa|wujud|penampakan)\b/i,
];

export type WebSearchDetection = {
  needed: boolean;
  query: string;
  reason: string;
};

export type ResponseMode = "simple" | "enhanced" | "rich";

export type ContentIntents = {
  images: boolean;
  news: boolean;
  video: boolean;
  product: boolean;
  location: boolean;
  website: boolean;
};

const NEWS_PATTERNS = [
  /\b(berita|news|headline|breaking|kabar terbaru|terkini|update terbaru)\b/i,
  /\b(viral|trending|gosip|rumor)\b/i,
];

const VIDEO_PATTERNS = [
  /\b(video|tutorial|cara (membuat|bikin|pakai|menggunakan)|how to|tonton|youtube|klip|trailer)\b/i,
];

const PRODUCT_PATTERNS = [
  /\b(harga|price|beli|buy|review produk|spesifikasi|spec|spek|rekomendasi (hp|laptop|gadget|produk)|toko|jual|murah|diskon)\b/i,
  /\b(iphone|samsung|xiaomi|laptop|smartphone|headphone|tws|kamera|sepatu|jam tangan)\b/i,
];

const LOCATION_PATTERNS = [
  /\b(di mana|dimana|lokasi|alamat|peta|map|rute|arah|wisata|destinasi|restoran|hotel|cafe|kafe|stasiun|bandara|terdekat|near me)\b/i,
];

const BRAND_PHRASING =
  /\b(situs|website|web|platform|tool|aplikasi|app|layanan|service|company|perusahaan)\b/i;

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

function normalizeQuery(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s?.,!-]/gu, "")
    .trim();
}

function buildSearchQuery(userText: string): string {
  const cleaned = normalizeQuery(userText)
    .replace(/^(tolong|please|bisa|could you|can you|mohon|hey|hi|halo)\s+/i, "")
    .replace(/\?+$/, "")
    .trim();

  if (cleaned.length > 140) {
    return cleaned.slice(0, 140);
  }
  return cleaned;
}

function isSkipped(text: string): boolean {
  return anyMatch(SKIP_PATTERNS, text);
}

export function detectWebSearchNeed(userText: string): WebSearchDetection {
  const text = normalizeQuery(userText);
  const query = buildSearchQuery(userText);

  if (text.length < 3) {
    return { needed: false, query, reason: "too_short" };
  }

  if (isSkipped(text)) {
    return { needed: false, query, reason: "skip_pattern" };
  }

  if (anyMatch(SEARCH_TRIGGERS, text)) {
    return { needed: true, query, reason: "external_signal" };
  }

  if (anyMatch(STRONG_VISUAL, text)) {
    return { needed: true, query, reason: "visual_signal" };
  }

  // Default: answer from the model's own knowledge (no rich content).
  return { needed: false, query, reason: "no_external_signal" };
}

const SIMPLE_PATTERNS = [
  /^(hi|halo|hello|hey|thanks|thank you|terima kasih|makasih|ok|oke|sip|noted|good|bagus|mantap)\b/i,
  /\b(siapa kamu|siapa anda|kamu siapa|who are you|nama kamu|kamu bisa apa|apa kabar|how are you)\b/i,
  /\b(jam berapa|pukul berapa|what time|tanggal berapa|hari apa|what day)\b/i,
  /\d\s*[+\-*/×÷^]\s*\d/,
  /\b(translate|terjemah(kan)?|ringkas(kan|an)?|rangkum(kan)?|summarize|summary|rewrite|tulis ulang|parafrase|paraphrase|koreksi)\b/i,
];

function isSimpleQuery(text: string): boolean {
  const normalized = normalizeQuery(text);
  if (normalized.length <= 12 && !normalized.includes("?")) {
    return true;
  }
  return anyMatch(SIMPLE_PATTERNS, normalized);
}

/**
 * Decide how rich the rendered response should be:
 * - "rich": needs external/current info → web search + cards/sources.
 * - "simple": greetings, identity, time, math, trivial tasks → bare answer.
 * - "enhanced": explanations, coding, tutorials → clean formatted answer, no cards.
 */
export function classifyResponseMode(userText: string): ResponseMode {
  if (detectWebSearchNeed(userText).needed) {
    return "rich";
  }
  if (isSimpleQuery(userText)) {
    return "simple";
  }
  return "enhanced";
}

export function classifyContentIntents(userText: string): ContentIntents {
  const text = normalizeQuery(userText);

  const news = anyMatch(NEWS_PATTERNS, text);
  const video = anyMatch(VIDEO_PATTERNS, text);
  const product = anyMatch(PRODUCT_PATTERNS, text);
  const location = anyMatch(LOCATION_PATTERNS, text);
  // Gallery only for explicit visual intent — never just because a query
  // mentions a place or product.
  const images = !news && anyMatch(STRONG_VISUAL, text);

  // Website preview cards: short brand/tool/site lookups (e.g. "Tavily",
  // "apa itu Notion", "OpenRouter pricing") rather than every search.
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const brandPhrasing = BRAND_PHRASING.test(text);
  const website =
    !(news || video || product || location) &&
    (wordCount <= 3 || (brandPhrasing && wordCount <= 8));

  return { images, news, video, product, location, website };
}
