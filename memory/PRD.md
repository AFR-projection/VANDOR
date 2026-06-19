# VANDOR v3.2 — Product Requirements Document

## Project Overview
VANDOR is a personal AI assistant (Jarvis-style) built on Next.js 16, OpenRouter, Neon Postgres + pgvector, AI SDK. Single-owner, PIN gate, long-term memory, settings from UI.

## Recent Major Refactor (Jan 2026)

### Vault Isolation Architecture
**Goal**: Make Vault a fully isolated private storage manager, completely separated from the AI system.

**Architecture decisions:**
- **Vault Mode (per-chat)**: State derived from message history (`data-vault-mode-enter` / `data-vault-mode-exit`). No DB column needed. Each chat has independent mode.
- **Hard isolation in chat route**: When `isVaultModeActive(messages)` is true, server bypasses LLM completely and routes only vault direct commands.
- **AI tools cleanup**: `manageVault` removed from `ChatTools`, registry, tool router, orchestrator. `searchAllUserData` no longer returns vault files.
- **Two-world separation**:
  - **Chat Mode**: AI on, memory on, web search on, full tool set
  - **Vault Mode**: AI off, memory off, web search off, only vault direct commands
- **Explicit consent bridge**: `/share-to-ai <id>` — only way to expose vault content to AI, with warning UI

### Implementation (Jan 2026)
- **NEW** `lib/vault/mode.ts` — vault mode state derivation (per-chat from messages)
- **NEW** `components/chat/vault-mode-banner.tsx` — sticky terminal-style banner with status
- **NEW** `components/chat/vault-mode-cards.tsx` — enter / exit / denied / read / share-to-ai cards
- **UPDATED** `lib/chat/vault-slash.ts` — new parsers: `/v` enter, bare `list/read/add/update/delete`, `exit`, `/share-to-ai`
- **UPDATED** `lib/v4/commands.ts` — new direct command kinds + isolated parser for vault mode
- **UPDATED** `app/(chat)/api/chat/route.ts` — vault mode detection + hard-block LLM
- **UPDATED** `lib/ai/tools/assistant-tools.ts` — removed `manageVaultTool`
- **UPDATED** `lib/memory/queries.ts` — `searchAllUserData` no longer returns `vaultFiles`
- **UPDATED** `lib/ai/tools/registry.ts`, `lib/v4/tool-router.ts`, `lib/v4/prompt-tools.ts`, `lib/ai/prompts.ts` — removed manageVault references
- **UPDATED** `lib/vault/chat-context.ts` — active vault now sourced from `data-share-to-ai`
- **UPDATED** `components/chat/shell.tsx` — render `VaultModeBanner` when active
- **UPDATED** `components/chat/multimodal-input.tsx` — vault mode placeholder + terminal styling + `add` triggers upload UI
- **UPDATED** `components/chat/message.tsx` — render new vault data parts
- **UPDATED** `lib/types.ts` — registered new custom UI data types

### Commands

**Chat Mode (default):**
- `/v` → enter Vault Mode
- `/v list` → list vault files
- `/v get <q>` → show metadata card
- `/v del <q>` → delete file
- `/v up` → trigger upload UI
- `/share-to-ai <id>` → share vault file to AI (with warning)

**Vault Mode (isolated, no AI):**
- `list` → list files
- `read <id|name>` → show metadata + inline text content (for text files ≤32KB)
- `add` → trigger upload UI
- `update <id> tags:work,private` or `update <id> summary: My CV`
- `delete <id|name>` → delete
- `exit` / `/chat` / `quit` → return to Chat Mode

### Key Invariants
1. Vault data NEVER enters LLM context unless explicit `/share-to-ai <id>`
2. Vault data NEVER touches embedding / pgvector / memory retrieval
3. Vault data NEVER reaches `searchDb` / `manageVault` (latter no longer exists)
4. Vault Mode is per-chat — chat A can be in vault mode, chat B can be in chat mode

## Testing
- Static analysis: `npx tsc --noEmit -p tsconfig.json` → **PASS**
- Unit tests: `npx tsx --test lib/search/detect.test.ts` → **11/11 PASS**
- ESLint on all modified files → **PASS**

## Future / Backlog
- E2E tests covering vault mode transitions
- Audit log UI for vault mode entry/exit
- Multi-file `add` flow with progress per file
- Vault Mode keyboard shortcut (Ctrl+K → /v)
- Encrypted note creation (`add note` without file upload)
