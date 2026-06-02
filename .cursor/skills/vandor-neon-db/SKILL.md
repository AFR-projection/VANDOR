---
name: vandor-neon-db
description: >-
  Neon Postgres setup, Drizzle migrations, schema changes, or database queries
  for VANDOR. Use when editing lib/db or fixing migration errors.
---

# VANDOR Neon Database

## Connection

- Env: `POSTGRES_URL` — Neon connection string with `?sslmode=require`
- Drizzle config: `drizzle.config.ts` reads `.env.local`

## Migrations

```bash
npm run db:migrate
```

Migrations live in `lib/db/migrations/`. Journal: `lib/db/migrations/meta/_journal.json`.

## Schema

- `lib/db/schema.ts` — Drizzle tables
- `lib/db/queries.ts` — chat, user, messages CRUD

## pgvector

Migration `0001_memory_pgvector.sql`:

- `CREATE EXTENSION vector`
- Table `UserMemory` with `vector(1536)` + HNSW index

Enable in Neon: Project → Extensions → **pgvector** (or run SQL above).

## New migration workflow

1. Edit `lib/db/schema.ts`
2. `npm run db:generate` (optional) or hand-write SQL in `lib/db/migrations/`
3. Add entry to `_journal.json`
4. `npm run db:migrate`

## Neon docs

https://neon.tech/docs/extensions/pgvector
