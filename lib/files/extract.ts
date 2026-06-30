import "server-only";

import { classify, type FileKind, isExtractable } from "./mime";

export type ExtractedFile = {
  url: string;
  name: string;
  mime: string;
  kind: FileKind;
  text: string;
  truncated: boolean;
  bytes: number;
  meta?: Record<string, unknown>;
  error?: string;
};

const MAX_TEXT_CHARS = 60_000;

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return {
    text: `${text.slice(0, MAX_TEXT_CHARS)}\n\n[…truncated ${text.length - MAX_TEXT_CHARS} chars]`,
    truncated: true,
  };
}

async function fetchBuffer(url: string, userId?: string): Promise<Buffer> {
  if (userId) {
    const { isVaultOpenUrl, readVaultAttachment } = await import(
      "./vault-attachment"
    );
    if (isVaultOpenUrl(url)) {
      const vault = await readVaultAttachment(userId, url);
      if (vault) {
        return vault.data;
      }
    }
  }
  const { isChatFileServeUrl, isPrivateR2Url, r2ChatKeyFromUrl } = await import(
    "./chat-file-url"
  );
  if (isPrivateR2Url(url) || isChatFileServeUrl(url)) {
    const key = r2ChatKeyFromUrl(url);
    if (key) {
      const { getR2Object } = await import("@/lib/storage/r2");
      return getR2Object(key);
    }
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function extractPdf(
  buf: Buffer
): Promise<{ text: string; meta: Record<string, unknown> }> {
  const mod = await import("pdf-parse");
  const PDFParse = (
    mod as {
      PDFParse: new (opts: {
        data: Uint8Array;
      }) => {
        getText: () => Promise<{ text: string; pages?: unknown[] }>;
        getInfo?: () => Promise<{ info?: unknown; total?: number }>;
        destroy?: () => Promise<void>;
      };
    }
  ).PDFParse;
  const parser = new PDFParse({
    data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
  });
  try {
    const text = await parser.getText();
    let info: unknown;
    let pages: number | undefined;
    try {
      const i = await parser.getInfo?.();
      info = i?.info;
      pages = i?.total;
    } catch {
      /* metadata optional */
    }
    return {
      text: text.text ?? "",
      meta: { pages: pages ?? text.pages?.length, info },
    };
  } finally {
    try {
      await parser.destroy?.();
    } catch {
      /* ignore */
    }
  }
}

async function extractDocx(
  buf: Buffer
): Promise<{ text: string; meta: Record<string, unknown> }> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return { text: value, meta: {} };
}

async function extractXlsx(
  buf: Buffer
): Promise<{ text: string; meta: Record<string, unknown> }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  const sheets: { name: string; rows: number }[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const rowCount = csv.split("\n").length;
    sheets.push({ name, rows: rowCount });
    parts.push(`### Sheet: ${name}\n${csv}`);
  }
  return { text: parts.join("\n\n"), meta: { sheets } };
}

async function extractText(
  buf: Buffer
): Promise<{ text: string; meta: Record<string, unknown> }> {
  return { text: buf.toString("utf8"), meta: {} };
}

export async function extractFromBuffer(
  buf: Buffer,
  mime: string,
  name: string
): Promise<{ text: string; meta: Record<string, unknown> } | null> {
  const kind = classify(mime, name);
  if (!isExtractable(kind)) {
    return null;
  }

  let raw: { text: string; meta: Record<string, unknown> };
  switch (kind) {
    case "pdf":
      raw = await extractPdf(buf);
      break;
    case "docx":
      raw = await extractDocx(buf);
      break;
    case "xlsx":
      raw = await extractXlsx(buf);
      break;
    case "csv":
    case "json":
    case "text":
    case "code":
      raw = await extractText(buf);
      break;
    default:
      return null;
  }
  const { text } = truncate(raw.text);
  return { text, meta: raw.meta };
}

export async function extractFile(
  input: {
    url: string;
    name: string;
    mime: string;
  },
  userId?: string
): Promise<ExtractedFile> {
  const kind = classify(input.mime, input.name);
  const base: ExtractedFile = {
    url: input.url,
    name: input.name,
    mime: input.mime,
    kind,
    text: "",
    truncated: false,
    bytes: 0,
    meta: {},
  };

  if (!isExtractable(kind)) {
    return base;
  }

  try {
    const buf = await fetchBuffer(input.url, userId);
    base.bytes = buf.byteLength;

    let raw: { text: string; meta: Record<string, unknown> };
    switch (kind) {
      case "pdf":
        raw = await extractPdf(buf);
        break;
      case "docx":
        raw = await extractDocx(buf);
        break;
      case "xlsx":
        raw = await extractXlsx(buf);
        break;
      case "csv":
      case "json":
      case "text":
      case "code":
        raw = await extractText(buf);
        break;
      default:
        raw = { text: "", meta: {} };
    }
    const { text, truncated } = truncate(raw.text);
    return {
      ...base,
      text,
      truncated,
      meta: raw.meta,
    };
  } catch (err) {
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function extractAll(
  inputs: { url: string; name: string; mime: string }[],
  userId?: string
): Promise<ExtractedFile[]> {
  return Promise.all(inputs.map((input) => extractFile(input, userId)));
}

/** Build a compact block to inject into the system prompt. */
export function buildFilesContextBlock(files: ExtractedFile[]): string {
  if (files.length === 0) return "";

  const extractable = files.filter(
    (f) =>
      f.text && f.kind !== "image" && f.kind !== "video" && f.kind !== "audio"
  );
  const headerLines = files.map((f) => {
    const status = f.error
      ? `[error: ${f.error}]`
      : f.text
        ? `[${f.bytes} bytes, extracted${f.truncated ? ", truncated" : ""}]`
        : f.kind === "image"
          ? `[sent to model as native media; editImage imageUrl: ${f.url}]`
          : f.kind === "video" || f.kind === "audio"
            ? "[sent to model as native media]"
            : `[${f.kind}, no text extraction]`;
    return `- ${f.name} (${f.mime}, ${f.kind}) ${status}`;
  });

  const bodies = extractable.map(
    (f) => `### File: ${f.name} (${f.kind})\n\n\`\`\`\n${f.text}\n\`\`\`\n`
  );

  return `## Attached files
${headerLines.join("\n")}

${bodies.join("\n")}`.trim();
}
