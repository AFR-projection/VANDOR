---
name: vandor-memory
description: >-
  VANDOR Memory v1 — pgvector long-term memory, embeddings, extraction, or
  retrieval. Use when improving Jarvis-like recall or debugging memory.
---

# VANDOR Memory v1

## Flow

1. **Retrieve** (before each reply): `lib/memory/context.ts` → `searchMemories` + `listRecentMemories` → injected in `systemPrompt` via `memoryContext`
2. **Extract** (after assistant reply): `lib/memory/extract.ts` → LLM JSON → `saveMemory`
3. **Embed**: `lib/memory/embeddings.ts` → OpenRouter `/v1/embeddings`

## Storage

- Table: `UserMemory` (see `lib/db/schema.ts`)
- Categories: `fact`, `preference`, `goal`, `person`, `event`, `instruction`
- Dedup: cosine similarity ≥ 0.92 skips insert

## Config

- `MEMORY_EMBEDDING_MODEL` — default `openai/text-embedding-3-small`
- Requires `POSTGRES_URL` + `OPENROUTER_API_KEY`

## Tuning

| Parameter | File | Default |
|-----------|------|---------|
| Search limit | `context.ts` / `searchMemories` | 6 semantic + 4 recent |
| Min similarity | `queries.ts` | 0.72 |
| Max extracted per turn | `extract.ts` | 3 |

## Debugging

- Check migration `0001_memory_pgvector` applied
- Neon SQL: `SELECT count(*) FROM "UserMemory";`
- Logs: `Memory search failed` / `Save memory failed` in server console

## Future improvements

- User-facing memory manager UI
- Explicit `remember` tool for assistant
- Memory decay / importance boost on reuse
