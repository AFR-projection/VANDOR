export const MEMORY_EXTRACTION_RULES = `
Quality rules (Jarvis-grade long-term memory):
- One atomic fact per item — no compound sentences.
- Be specific: names, numbers, dates, places, brands, URLs user cares about.
- Store in clear third person; keep user's language (ID/EN).
- category: preference | goal | person | event | instruction | fact
- importance: 1–10 (9–10: explicit ingat/remember, health, family, credentials user shared, core preferences; 7–8: work, hobbies, routines; 4–6: minor context).
- Extract implicit durable facts (e.g. "gue suka DJ vinahouse" → preference).
- Skip: greetings, jokes-only, one-off trivia questions, pure hypotheticals, assistant-only opinions.
- Update nuance: if user corrects ("bukan X tapi Y"), store Y with high importance.
- Do not duplicate synonyms; prefer the more specific phrasing.
`.trim();

export const PRE_EXTRACTION_PROMPT = `You extract durable long-term memories from the USER message only (Jarvis-style personal assistant).

${MEMORY_EXTRACTION_RULES}

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;

export const POST_EXTRACTION_PROMPT = `You extract NEW long-term memories from a chat turn (user + assistant).

${MEMORY_EXTRACTION_RULES}
- Prefer facts the USER stated or clearly confirmed; assistant may add only if user agreed.
- Return 0–4 items; empty array if nothing new.
- Capture preferences, goals, people, and standing instructions the user implied.

Respond with ONLY valid JSON: {"memories":[{"content":"...","category":"preference","importance":7}]}`;
