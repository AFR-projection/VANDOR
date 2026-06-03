/** Combine two memory strings without an extra LLM call. */
export function mergeMemoryTexts(existing: string, incoming: string): string {
  const e = existing.trim();
  const i = incoming.trim();
  if (!e) return i;
  if (!i) return e;
  if (e === i) return e;
  const el = e.toLowerCase();
  const il = i.toLowerCase();
  if (il.includes(el)) return i;
  if (el.includes(il)) return e;
  return i;
}
