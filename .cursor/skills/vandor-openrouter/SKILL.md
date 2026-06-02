---
name: vandor-openrouter
description: >-
  Configure OpenRouter models, API keys, pricing tiers, or UI model selector
  for VANDOR. Use when adding models, fixing LLM errors, or switching providers.
---

# VANDOR OpenRouter

## Env

- `OPENROUTER_API_KEY` — required for chat, titles, embeddings
- `OPENROUTER_APP_NAME`, `OPENROUTER_APP_URL` — optional analytics headers
- `ENABLE_ALL_OPENROUTER_MODELS=1` — expose full model catalog in UI

## Code paths

| File | Role |
|------|------|
| `lib/ai/openrouter.ts` | `createOpenRouter` client |
| `lib/ai/providers.ts` | `getLanguageModel`, `getTitleModel` |
| `lib/ai/models.ts` | Curated favorites, `fetchOpenRouterModels`, capabilities |
| `app/(chat)/api/models/route.ts` | Public model list for UI |
| `components/chat/multimodal-input.tsx` | Model selector (Favorit / Gratis / providers) |

## Adding a curated model

1. Add entry to `chatModels` in `lib/ai/models.ts` with correct OpenRouter `id`
2. Set `tier: "free"` if prompt/completion pricing is 0 on OpenRouter
3. Capabilities auto-fetched from OpenRouter `supported_parameters`

## Free vs paid

OpenRouter free models often end with `:free` or have zero pricing in API.

## Reasoning models

Pass `providerOptions.openrouter.reasoning` in chat route when `reasoningEffort` set on model config.

## Docs

https://openrouter.ai/docs
