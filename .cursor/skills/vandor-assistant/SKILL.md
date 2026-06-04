---
name: vandor-assistant
description: >-
  Work on the VANDOR personal AI assistant (Jarvis-style). Use for chat,
  persona, memory integration, OpenRouter models, or Neon database changes
  in this repo.
---

# VANDOR Assistant

## Architecture

- **UI**: Next.js App Router, `components/chat/`, `hooks/use-active-chat.tsx`
- **Chat API**: `app/(chat)/api/chat/route.ts` — streams via AI SDK `streamText`
- **LLM**: OpenRouter only — `lib/ai/openrouter.ts`, `lib/ai/providers.ts`
- **Models list**: `lib/ai/models.ts` + `GET /api/models` (OpenRouter API)
- **DB**: Neon Postgres via `POSTGRES_URL`, Drizzle in `lib/db/`
- **Memory v1**: `lib/memory/` — pgvector HNSW, auto extract after replies
- **Slash skills**: `lib/chat/slash-skills.ts`, `components/chat/slash-commands.tsx`
- **Catatan**: `manageNotes` tool + `UserNote` table; UI tab Pengaturan → Catatan
- **Observability**: `ToolEvent` table + tab Aktivitas (`lib/observability/`)
- **Voice**: `POST /api/voice/transcribe` + mic button in composer
- **PWA**: `app/manifest.ts`, `public/sw.js`, `PwaRegister`
- **Memory extract model**: `lib/ai/memory-model.ts` (never `openrouter/free`)

## Persona

System prompt lives in `lib/ai/prompts.ts` (`vandorPersonaPrompt`). Keep tone: capable, concise, proactive, respects user language (ID/EN).

## Changing default model

Edit `DEFAULT_CHAT_MODEL` in `lib/ai/models.ts` and curated `chatModels` array.

## Do not

- Reintroduce Vercel AI Gateway unless explicitly requested
- Commit `.env.local` or API keys
- Break Playwright model selector tests (keep `Mistral Small` in curated list)
