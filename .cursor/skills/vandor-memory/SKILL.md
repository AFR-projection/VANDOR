---
name: vandor-memory
description: >-
  VANDOR Memory v2 — pgvector long-term memory, embeddings, extraction, merge,
  decay scoring, or retrieval. Use when improving Jarvis-like recall or debugging memory.
---

# VANDOR Memory v2

## Flow

1. **Pre-extract** (before reply, parallel): `preExtractUserMemories` — user message, explicit "ingat"/"remember" or memorable hints
2. **Retrieve**: `lib/memory/context.ts` → semantic + recent → `scoreMemory` (decay + reuse boost) → `touchMemories`
3. **Post-extract** (after reply): `extractAndStoreMemories` → LLM JSON → `saveMemory` (merge if similar)
4. **Embed**: `lib/memory/embeddings.ts` → OpenRouter `/v1/embeddings`

## Storage

- Table: `UserMemory` — `metadata` JSON: `accessCount`, `lastAccessedAt`, `preExtracted`, etc.
- Categories: `fact`, `preference`, `goal`, `person`, `event`, `instruction`
- Merge: similarity ≥ 0.82 updates row; ≥ 0.92 identical text skips insert

## Config (Pengaturan Memori)

- `preExtractFromUser`, `mergeSimilarMemories`
- `semanticSearchLimit` (default 14), `recentMemoriesLimit` (10), `minSimilarity` (0.68)
- `MEMORY_EMBEDDING_MODEL` / slot `embeddingModel`

## Key files

| File | Role |
|------|------|
| `lib/memory/extract.ts` | Pre + post extraction |
| `lib/memory/queries.ts` | save, search, merge, touch |
| `lib/memory/scoring.ts` | Recall ranking |
| `lib/memory/remember.ts` | Explicit remember detection |

## Debugging

- `SELECT count(*) FROM "UserMemory";`
- Logs: `Memory pre-extraction failed`, `Memory search failed`, `Save memory failed`
