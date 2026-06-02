/**
 * MIME type classification & policy for VANDOR uploads.
 * Edge-safe (no node:* imports).
 */

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "docx"
  | "pptx"
  | "xlsx"
  | "csv"
  | "text"
  | "code"
  | "json"
  | "archive"
  | "other";

const CODE_EXT = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "go", "rs", "java",
  "kt", "swift", "c", "h", "cpp", "hpp", "cs", "php", "sh", "bash", "zsh",
  "ps1", "lua", "r", "scala", "clj", "ex", "exs", "dart", "vue", "svelte",
  "html", "css", "scss", "sass", "less", "sql", "graphql", "yml", "yaml",
  "toml", "ini", "conf", "env", "dockerfile", "makefile",
]);

const TEXT_EXT = new Set([
  "txt", "md", "markdown", "log", "rtf", "tex", "rst",
]);

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "text/",
  "application/",
];

const ALLOWED_APP_TYPES = new Set([
  "application/pdf",
  "application/json",
  "application/xml",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/javascript",
  "application/typescript",
  "application/sql",
  "application/x-yaml",
  "application/yaml",
]);

export function isMimeAllowed(mime: string): boolean {
  if (!mime) return false;
  if (mime.startsWith("image/")) return true;
  if (mime.startsWith("video/")) return true;
  if (mime.startsWith("audio/")) return true;
  if (mime.startsWith("text/")) return true;
  if (ALLOWED_APP_TYPES.has(mime)) return true;
  return false;
}

export function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function classify(mime: string, name = ""): FileKind {
  const m = mime.toLowerCase();
  const ext = extOf(name);

  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    m === "application/msword" ||
    ext === "docx" ||
    ext === "doc"
  )
    return "docx";
  if (
    m === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    m === "application/vnd.ms-powerpoint" ||
    ext === "pptx" ||
    ext === "ppt"
  )
    return "pptx";
  if (
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    m === "application/vnd.ms-excel" ||
    ext === "xlsx" ||
    ext === "xls"
  )
    return "xlsx";
  if (m === "text/csv" || ext === "csv") return "csv";
  if (m === "application/json" || ext === "json") return "json";
  if (
    m === "application/zip" ||
    m === "application/x-zip-compressed" ||
    m === "application/x-7z-compressed" ||
    m === "application/x-rar-compressed" ||
    m === "application/x-tar" ||
    m === "application/gzip" ||
    ["zip", "rar", "7z", "tar", "gz", "tgz"].includes(ext)
  )
    return "archive";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext) || m.startsWith("text/")) return "text";
  return "other";
}

/**
 * True for kinds whose textual content we can extract server-side and pass to
 * the model as plain text alongside the chat message.
 */
export function isExtractable(kind: FileKind): boolean {
  return (
    kind === "pdf" ||
    kind === "docx" ||
    kind === "xlsx" ||
    kind === "csv" ||
    kind === "json" ||
    kind === "code" ||
    kind === "text"
  );
}
