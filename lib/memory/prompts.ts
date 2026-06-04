export const MEMORY_EXTRACTION_RULES = `
Quality rules:
- One atomic fact per item (no compound sentences).
- Be specific: names, numbers, dates, places when stated.
- Indonesian or English input → store in clear third person (same language as user is fine).
- category: preference | goal | person | event | instruction | fact
- importance: 1–10 (8–10 for explicit "ingat"/"remember", names, health, work, relationships).
- Skip: greetings, jokes-only, one-off questions, assistant opinions, hypotheticals.
- Do not duplicate obvious synonyms of the same fact.
`.trim();

export const PRE_EXTRACTION_PROMPT = `You extract durable long-term memories from the USER message only (Jarvis-style personal assistant).

${MEMORY_EXTRACTION_RULES}

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;

export const POST_EXTRACTION_PROMPT = `You extract NEW long-term memories from a chat turn (user + assistant).

${MEMORY_EXTRACTION_RULES}
- Prefer facts the USER stated or clearly confirmed; assistant may add only if user agreed.
- Return 0–3 items; empty array if nothing new.

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;
