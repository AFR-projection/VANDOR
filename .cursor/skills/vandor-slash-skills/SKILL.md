---
name: vandor-slash-skills
description: >-
  VANDOR chat slash skills (/catat, /catatan, /todo, …), manageNotes tool,
  and UserNote DB. Use when adding slash commands, personal notes, or task
  workflows in the Next.js chat app.
---

# VANDOR Slash Skills & Catatan

## Slash commands (chat UI)

Defined in `lib/chat/slash-skills.ts`, rendered in `components/chat/slash-commands.tsx`.

| Command | Behavior |
|---------|----------|
| `/catat` | Prefill `Judul:` + `Isi:` — user sends → model calls `manageNotes` create |
| `/catatan` | Auto-send → `manageNotes` list (judul saja) |
| `/baca` | Prefill judul → `manageNotes` get (judul + isi penuh) |
| `/todo` | Task template → `updateTask` |
| `/ingat` | Memori → `saveMemory` |
| `/cari` | Web search prompt |
| `/cuaca` | getLocation + getWeather |
| `/waktu` | getCurrentTime |
| `/ringkas` | Ringkas chat |

Handler: `handleSlashSelect` in `components/chat/multimodal-input.tsx` (`insertText` vs `sendText`).

## Tool: manageNotes

`lib/ai/tools/assistant-tools.ts` — actions: `create`, `list`, `get`, `update`, `delete`.

DB: `UserNote` via `lib/memory/assistant-db.ts`.

## Prompt

`NOTES_SKILL_SYSTEM_HINT` in `lib/ai/prompts.ts` (inside `vandorToolsPrompt`).

## Adding a new skill

1. Add entry to `SLASH_SKILLS` in `lib/chat/slash-skills.ts`
2. Add icon in `SKILL_ICONS` in `slash-commands.tsx`
3. If new server capability: extend `manageNotes` or add tool + register in `lib/ai/tools/registry.ts`
