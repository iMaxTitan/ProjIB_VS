# CS Platform — Claude Instructions

## Project

Next.js 15 + React 19 + TypeScript strict + PostgreSQL 16 + PostgREST + pgvector + Tailwind CSS.
Deploy: Hetzner Cloud VPS (PM2). Auth: Azure AD + custom PostgREST JWT (HS256).

## IMPORTANT: Read Before Work

- **`docs/ARCHITECTURE.md`** — modules, boundaries, data flows (source of truth)
- **`docs/DECISIONS.md`** — architectural decisions (don't propose alternatives without asking)

## Critical Rules

### File Size Limits
- Services (`lib/ops/`, `lib/kb/`): max **300 lines**
- Components (`components/`): max **400 lines**
- Hooks, API routes: max **300 lines**
- If file grows — split by responsibility

### Module Boundaries
```
lib/ has exactly 4 folders: bot/, kb/, ops/, shared/
components/ has exactly 4 folders: auth/, navigation/, ui/, dashboard/

ALLOWED:
  components → hooks → fetch(/api/...) → lib/ops/
  components → lib/ops/ pure utils (format/calc only: no DB, no side effects, no query-options)
  app/api → lib/ops/, lib/shared/auth/
  lib/ops/, lib/kb/ → lib/shared/
  bot/core/registry → domain/bot-adapter → bot/shared/ + domain/*

FORBIDDEN:
  components → lib/ops/ service calls or PostgREST queries (use hooks)
  components → lib/ops/ query-options directly (use dedicated hooks)
  components → lib/kb|bot/ directly (only through hooks)
  bot/core/ → domain/* directly (only through bot-adapter)
  domain/* → bot/core/ (domain doesn't know about bot)
  kb/ → bot/* or ops/* (KB is independent)
  lib/shared/ → lib/ops|kb|bot/ (shared has no business deps)
```

### API Routes — Mandatory Pattern
- Auth: `isRequestAuthorized(req)` + `getDbUserId(req)` (from cookie, NOT Azure oid)
- DB: `getDb()` / `getServerDb()` — service-role ONLY. Never `import { supabase }` server-side
- Rate limit ALL endpoints. Log with `logger`, never `console.log`

### Bot Tools — Return Ready Result
Tools return `FormattedResult` (HTML) or `DocumentResult` (file). AI synthesis happens INSIDE the tool using server `ANTHROPIC_API_KEY`. Orchestrator only selects the tool and passes result as-is — never synthesizes itself.

### Sync Rules
- Changes to `docs/USER_GUIDE.md` → sync `src/components/dashboard/header/HelpContent.tsx`
- User-visible changes → add to `MANUAL_BUILD_CHANGELOG_ITEMS` in `ActivityContent.tsx`
- New module/service/component → update `.claude/rules/glossary.md` (русские алиасы → файлы)
- New UI standard/element → add to `demo-design-system.html` + `.claude/rules/ui-design.md`
- UI element doesn't fit standard → STOP, ask user, get approval, then add to standards

## Verify Your Work

IMPORTANT: After making changes, verify before reporting success:
- **TypeScript**: `npm run typecheck` — MUST pass with zero errors
- **Lint**: `npm run lint` — fix warnings before committing
- **Build**: `npm run build` — run after significant changes
- **Tests**: `npm run test:e2e` — when touching tested functionality

If any check fails — fix it yourself, don't report "done" with errors.

## Common Mistakes — See `.claude/rules/anti-patterns.md`

## Task Map

See `.claude/rules/task-map.md` for file locations by task type.
