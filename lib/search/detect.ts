// ── Never search: greetings, generation, meta/identity, trivial tasks ───────
const SKIP_PATTERNS = [
  /^(hi|halo|hello|hey|thanks|thank you|terima kasih|makasih|ok|oke|sip|noted|good|bagus|mantap)\s*[!.?]*$/i,
  /^(write|buatkan|generate|create)\s+(me\s+)?(a\s+)?(code|script|function|program|gambar|image|logo|pdf|docx)/i,
  /^\/\w+/,
  /^\/?(tt|ytv|yts|ig)\s+\S+/i,
  /\b(edit|edot|editan|photoshop|manipulasi|inpaint|ganti background|ubah foto|ubah gambar|retouch|airbrush)\b/i,
  /\b(buatkan gambar|generate image|draw|gambarin|ilustrasi|logo)\b/i,
  /\b(siapa kamu|siapa anda|kamu siapa|who are you|nama kamu|kamu bisa apa|apa yang bisa kamu|what can you do|apa kabar|how are you|kabar kamu)\b/i,
  /\b(jam berapa|pukul berapa|what time|tanggal berapa|hari apa|what day|sekarang jam)\b/i,
  /\d\s*[+\-*/×÷^]\s*\d/,
  /\b(translate|terjemah(kan)?|ringkas(kan|an)?|rangkum(kan)?|summarize|summary|rewrite|tulis ulang|parafrase|paraphrase|koreksi|perbaiki (kalimat|tata bahasa|grammar|ejaan))\b/i,
];

/** Catatan, memori, task, kredensial pribadi — tidak butuh web. */
const LOCAL_TASK_PATTERNS = [
  /\b(simpan|save)\s+(catatan|note|memo)\b/i,
  /\b(catat|catatan)\s+(ini|ku|saya|pribadi)?\b/i,
  /^judul\s*:/im,
  /^isi\s*:/im,
  /\b(ingat|jangan lupa|remember)\s+(ini|ini ya|ya)?\b/i,
  /\bmanageNotes\b/i,
  /\b(updateTask|buat task|todo)\b/i,
  /\b(username|user\s?name|password|pin|rekening|no\.?\s*rek|transfer ke|biaya transfer)\b/i,
  /\b(daftar catatan|catatan (saya|ku|pribadi)|buka catatan|lihat catatan)\b/i,
  /\b(apa saja catatan|list catatan)\b/i,
  /\b(download|unduh|simpan)\s+(video|audio|mp3|mp4)\b/i,
  /^\/?(tt|ytv|yts|ig)\s+\S+/i,
];

/** Minta tautan / URL — butuh web (sering follow-up singkat). */
const LINK_REQUEST_PATTERNS = [
  /\b(berikan|kasih|kirim|share|bagi(?:kan)?|tolong)\s+(?:link|tautan|url)\b/i,
  /\b(link|tautan|url)(?:nya| nya)?\s*[!.?]*$/i,
  /^link\s*[!.?]*$/i,
  /\b(minta|butuh|perlu|ada)\s+(?:link|tautan|url)\b/i,
  /\b(cari(?:kan)?|temukan|carikan)\s+link\b/i,
  /\b(playlist|link\s+(?:youtube|yt|spotify|soundcloud))\b/i,
  /\b(open|buka)\s+(?:di\s+)?(youtube|spotify|soundcloud)\b/i,
];

/** Selalu cari web bila muncul (data live / eksternal). */
const LIVE_DATA_PATTERNS = [
  /\b(berapa skor|skor (sekarang|terbaru|hari ini)|hasil pertandingan|live\s*score|livescore)\b/i,
  /\b(spain|indonesia|manchester|barcelona|real madrid|liverpool|arsenal|chelsea)\s+vs\b/i,
  /\bvs\.?\s+(spain|iraq|indonesia|japan|korea|brazil|argentina)\b/i,
  /\b(berita|news|headline|breaking|kabar terbaru|viral|trending)\b/i,
  /\b(prediksi harga|harga emas|harga saham|harga bitcoin|kurs (dolar|usd|rupiah)|nilai tukar)\b/i,
  /\b(saham|stock|crypto|bitcoin|ethereum|forex)\s+(hari ini|sekarang|terbaru)\b/i,
  /\b(cuaca (di |sekarang)|weather (in |now|today))\b/i,
  /\b(cari(kan)?\s+(di )?(internet|web|google)|search (the )?web|googling)\b/i,
  /\b(cek (di )?(internet|web)|telusuri|browsing)\b/i,
  /\b(rekomendasi (restoran|hotel|cafe|tempat makan)|restoran terdekat|hotel terdekat|near me)\b/i,
  /\b20[12]\d\b.*\b(terbaru|news|rilis|harga|skor)\b/i,
];

/** Butuh konteks tanya / recency — hindari false positive di catatan pribadi. */
const CONTEXTUAL_LIVE_PATTERNS = [
  /\b(terbaru|terkini|latest|current|hari ini|kemarin|minggu ini|bulan ini|baru saja|barusan)\b/i,
  /\b(harga|price|berapa harga|murah|mahal|diskon|promo)\b/i,
  /\b(bandingkan|compare|perbandingan)\b/i,
  /\b(review|ulasan|spesifikasi|spek|benchmark)\b/i,
  /\b(kapan rilis|tanggal rilis|launch date)\b/i,
  /\b(rekomendasi|recommend)\b/i,
];

const STRONG_VISUAL = [
  /\b(foto|gambar|photo|picture|images?|wallpaper)\b/i,
  /\b(tampilkan|tampilin|tunjukkan|tunjukin|show me)\b.*\b(foto|gambar|photo|picture)\b/i,
];

export type WebSearchDetection = {
  needed: boolean;
  query: string;
  reason: string;
};

/** Konteks percakapan untuk follow-up singkat (mis. "berikan linknya"). */
export type WebSearchConversationContext = {
  /** Pesan user sebelumnya (tanpa pesan saat ini), terbaru di akhir. */
  priorUserTexts?: string[];
  /** Cuplikan jawaban asisten terakhir. */
  lastAssistantText?: string;
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
  /\b(berapa harga|harga (hp|laptop|iphone)|review produk|spesifikasi|rekomendasi (hp|laptop|gadget))\b/i,
  /\b(iphone|samsung|xiaomi|laptop|smartphone)\s+(terbaru|harga|review)\b/i,
];

const LOCATION_PATTERNS = [
  /\b(di mana|dimana|lokasi|alamat|peta|map|rute|arah|terdekat|near me)\b/i,
  /\b(restoran|hotel|cafe|kafe|wisata|destinasi)\s+(terdekat|dekat|recommended)\b/i,
];

const BRAND_PHRASING =
  /\b(situs|website|web|platform|tool|aplikasi|app|layanan|service|company|perusahaan)\b/i;

function anyMatch(patterns: RegExp[], text: string): boolean {
  return patterns.some((p) => p.test(text));
}

function normalizeQuery(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s?.,!@-]/gu, "")
    .trim();
}

function buildSearchQuery(userText: string): string {
  const cleaned = normalizeQuery(userText)
    .replace(
      /^(tolong|please|bisa|could you|can you|mohon|hey|hi|halo)\s+/i,
      ""
    )
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

function isLocalPersonalTask(text: string): boolean {
  return anyMatch(LOCAL_TASK_PATTERNS, text);
}

function isLinkOnlyRequest(text: string): boolean {
  const t = normalizeQuery(text);
  if (t.length > 100) {
    return false;
  }
  return anyMatch(LINK_REQUEST_PATTERNS, t);
}

function buildContextualSearchQuery(
  userText: string,
  ctx?: WebSearchConversationContext
): string | null {
  const prior = ctx?.priorUserTexts?.filter((t) => t.trim().length >= 8) ?? [];

  for (let i = prior.length - 1; i >= 0; i--) {
    const prev = prior[i];
    if (!prev || isLinkOnlyRequest(prev)) {
      continue;
    }
    const topic = buildSearchQuery(prev);
    if (
      isLinkOnlyRequest(userText) ||
      /\b(link|tautan|url|playlist)\b/i.test(userText)
    ) {
      return `${topic} youtube soundcloud`.slice(0, 140);
    }
    return topic;
  }

  const assistant = ctx?.lastAssistantText?.trim();
  if (assistant && assistant.length >= 24) {
    const clean = assistant
      .replace(/[#*_`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    const topic = buildSearchQuery(clean);
    if (topic.length >= 8) {
      return `${topic} official link youtube`.slice(0, 140);
    }
  }

  return null;
}

function hasLiveIntent(text: string): boolean {
  if (anyMatch(LIVE_DATA_PATTERNS, text)) {
    return true;
  }
  const asks =
    text.includes("?") ||
    /\b(berapa|berapaan|gimana|bagaimana|kapan|siapa|dimana|di mana|kenapa|mengapa|what|how|when|where|why)\b/i.test(
      text
    );
  const recency =
    /\b(sekarang|hari ini|terbaru|live|ongoing|real[- ]?time)\b/i.test(text);
  if (anyMatch(CONTEXTUAL_LIVE_PATTERNS, text) && (asks || recency)) {
    return true;
  }
  if (
    /\bvs\.?\b/i.test(text) &&
    (asks || recency || /\b(skor|match|pertandingan)\b/i.test(text))
  ) {
    return true;
  }
  return false;
}

/** Jangan sediakan tool webSearch — catatan/memori/sapaan ringan. */
export function shouldDisableWebSearchTool(userText: string): boolean {
  const { needed, reason } = detectWebSearchNeed(userText);
  if (needed) {
    return false;
  }
  if (/^\/?(tt|ytv|yts|ig)\s+\S+/i.test(userText.trim())) {
    return true;
  }
  return reason === "local_task" || reason === "skip_pattern";
}

export function detectWebSearchNeed(
  userText: string,
  conversation?: WebSearchConversationContext
): WebSearchDetection {
  const text = normalizeQuery(userText);
  const query = buildSearchQuery(userText);

  if (text.length < 3) {
    return { needed: false, query, reason: "too_short" };
  }

  if (isSkipped(text)) {
    return { needed: false, query, reason: "skip_pattern" };
  }

  if (isLocalPersonalTask(text)) {
    return { needed: false, query, reason: "local_task" };
  }

  if (isLinkOnlyRequest(text)) {
    const contextual = buildContextualSearchQuery(userText, conversation);
    return {
      needed: true,
      query: contextual ?? `${query || text} youtube link`.slice(0, 140),
      reason: contextual ? "link_follow_up" : "link_request",
    };
  }

  if (hasLiveIntent(text)) {
    return { needed: true, query, reason: "live_data" };
  }

  if (anyMatch(STRONG_VISUAL, text)) {
    return { needed: true, query, reason: "visual_signal" };
  }

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

const DETAIL_PATTERNS = [
  /\b(jelaskan|jelasin|detail|lengkap|mendalam|analisis|bandingkan|compare|step\s+by\s+step|langkah|tutorial|panduan|pros?\s+and\s+cons|kelebihan|kekurangan)\b/i,
];

export function classifyResponseMode(userText: string): ResponseMode {
  if (detectWebSearchNeed(userText).needed) {
    return "rich";
  }
  if (isSimpleQuery(userText) && !anyMatch(DETAIL_PATTERNS, userText)) {
    return "simple";
  }
  return "enhanced";
}

export function classifyContentIntents(userText: string): ContentIntents {
  const text = normalizeQuery(userText);
  const searchNeeded = detectWebSearchNeed(userText).needed;

  const news = searchNeeded && anyMatch(NEWS_PATTERNS, text);
  const video =
    searchNeeded && (anyMatch(VIDEO_PATTERNS, text) || isLinkOnlyRequest(text));
  const product = searchNeeded && anyMatch(PRODUCT_PATTERNS, text);
  const location = searchNeeded && anyMatch(LOCATION_PATTERNS, text);
  const images = searchNeeded && !news && anyMatch(STRONG_VISUAL, text);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const brandPhrasing = BRAND_PHRASING.test(text);
  const website =
    searchNeeded &&
    !(news || video || product || location) &&
    (wordCount <= 3 || (brandPhrasing && wordCount <= 8));

  return { images, news, video, product, location, website };
}
