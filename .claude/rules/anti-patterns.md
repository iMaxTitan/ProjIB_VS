---
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Anti-Patterns — Gotchas Specific to This Project

## Auth Gotchas
- `getUserIdFromToken()` returns **Azure AD oid** — NEVER use for DB queries
- Cookie `x-user-id` is the DB UUID — this is what `getDbUserId(req)` reads

## Import Nuance
- ✅ components → `lib/ops/` pure format/calc utils (no DB, no side effects, no query-options)
- ❌ components → `lib/ops/` query-options directly — create dedicated hooks in `hooks/`

## OpenAI / AI
- Use `max_completion_tokens` (NOT `max_tokens`) with OpenAI client
- Embedding format: pass as string `[${embedding.join(',')}]` — NOT raw array
- `match_kb_documents` RPC MUST be `SECURITY DEFINER`

## PostgreSQL/PostgREST
- Never read `.sql` migration files from disk — check actual DB state via PostgreSQL MCP
- Embedding: Voyage multilingual-2, 1024 dimensions, `input_type: 'document'|'query'`

## Deploy
- NEVER deploy (`bash deploy.sh`) without explicit user permission
