import type { WebSearchSource } from "./types";

const SOURCE_LINE_RE =
  /^-\s*(.+?)\s*[—–-]\s*(https?:\/\/\S+)\s*$/u;

export function parseSourceLines(text: string): WebSearchSource[] {
  const sources: WebSearchSource[] = [];
  for (const line of text.split("\n")) {
    const match = SOURCE_LINE_RE.exec(line.trim());
    if (match) {
      sources.push({
        title: match[1].trim(),
        url: match[2].trim(),
        snippet: "",
      });
    }
  }
  return sources;
}

export function parseStructuredWebResponse(text: string) {
  const answerMatch = text.match(
    /💬\s*ANSWER\s*\n([\s\S]*?)(?=\n🔗\s*SOURCES|\n📌\s*NOTES|$)/iu
  );
  const sourcesMatch = text.match(
    /🔗\s*SOURCES\s*\n([\s\S]*?)(?=\n📌\s*NOTES|$)/iu
  );
  const notesMatch = text.match(/📌\s*NOTES\s*\n([\s\S]*?)$/iu);

  const hasStructure = Boolean(answerMatch || sourcesMatch);

  return {
    hasStructure,
    answer: answerMatch?.[1]?.trim() ?? "",
    sourcesText: sourcesMatch?.[1]?.trim() ?? "",
    notes: notesMatch?.[1]?.trim() ?? "",
    parsedSources: sourcesMatch?.[1]
      ? parseSourceLines(sourcesMatch[1])
      : [],
  };
}

export function mergeWebSources(
  primary: WebSearchSource[],
  fallback: WebSearchSource[]
): WebSearchSource[] {
  const seen = new Set<string>();
  const merged: WebSearchSource[] = [];

  for (const source of [...primary, ...fallback]) {
    if (!source.url || seen.has(source.url)) {
      continue;
    }
    seen.add(source.url);
    merged.push(source);
  }

  return merged.slice(0, 5);
}
