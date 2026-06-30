const MAX_TITLE_LEN = 56;

export function fallbackTitleFromUserText(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (!line) {
    return "New chat";
  }
  if (line.length <= MAX_TITLE_LEN) {
    return line;
  }
  return `${line.slice(0, MAX_TITLE_LEN - 1)}…`;
}
