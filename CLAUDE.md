# CS Platform — Claude Instructions

## Long-term memory — brain MCP

Глобальная долговременная память (brain MCP) — отдельный репозиторий `C:\Proj\brain`. Протокол, контракт и утилиты живут там. В этом проекте brain используется только как потребитель через `mcp__brain__query_document` / `mcp__brain__insert_document`. Не создавай здесь файлы `memory/`, не дублируй протокол.

## Source of Truth Hierarchy

When you need a fact, follow this strict order. **Never cite a lower-priority source if a higher-priority one exists.**

| Priority | Source | When to use | Freshness rule |
|---|---|---|---|
| **1. Live code** in `src/` | Code, file paths, function signatures, constants | Always for code questions | Always read fresh — no caching |
| **2. Live DB** via `mcp__postgres__query` | Schema, RPC signatures, row data, UUIDs | Always for DB/schema questions | Always query live — `kb_chunks.id` and friends change after every reindex |
| **3. `docs/*.md` with valid frontmatter** | Architecture, pipeline overview, protocols | When you need a structured explanation | Check frontmatter `last_verified` + `freshness_ttl_days`. If expired → re-verify against code/DB before quoting |
| **4. `brain` MCP** | User preferences, decisions, project history, feedback | When you need to know what the user told you previously | Memory records can drift. Verify any actionable claim against live source before acting |
| **NEVER** | `memory/_archive/*` | — | These are frozen historical snapshots; do not cite as fact |
| **NEVER** | Numbers from prior conversation turns | — | Re-verify any baseline metric, cost, recall, etc. by re-running the relevant tool |

### Hard rules

- **Never cite a metric, baseline, UUID, or numeric claim from memory or a doc without verifying it first.** If `KB_RAG.md` says `MAX_TOKENS=700`, grep the code before quoting it. If brain says `Recall@10=0.5`, re-run the eval before quoting it.
- **Never claim "the code does X" without reading the file in this session.** The code may have changed since the last conversation.
- **Never claim "the DB has table X" without `mcp__postgres__query`** in this session. Schemas drift.
- **If a doc has a frontmatter `last_verified` older than its `freshness_ttl_days`**, treat its specific numbers/UUIDs/file paths as suspect and re-verify before quoting them. Run `npx tsx scripts/docs-freshness-check.ts` to see all stale docs.

### Freshness contract for KB-related docs

These docs have YAML frontmatter and are checked by `scripts/docs-freshness-check.ts`:

- `docs/KB_RAG.md` — pipeline reference (TTL 30 days)
- `docs/KB_EVAL_FRAMEWORK.md` — eval protocol (TTL 30 days)
- `docs/KB_REINDEX_PROTOCOL.md` — reindex procedure (TTL 60 days)

When you change `lib/kb/search.ts`, `chunker.ts`, `reranker.ts`, or any constant they reference — you **must** update the relevant doc's `last_verified` date in the same commit. The freshness check script will fail CI otherwise.

## Read First

Read these files before substantial work. Priority is top to bottom:

1. `docs/ARCHITECTURE.md` — source of truth for modules, boundaries, data flows
2. `docs/DECISIONS.md` — accepted architectural decisions; do not replace them without user approval
3. `docs/DEVELOPER_GUIDE.md` — route, data-access, and Query patterns
4. `.claude/rules/ui-design.md` — UI standards and shared component rules
5. `.claude/rules/task-map.md` — where to edit by task type
6. `.claude/rules/anti-patterns.md` — recurring mistakes to avoid

If these files conflict, use the higher-priority file.

## Project Truths

- Stack: Next.js 15, React 19, TypeScript, Tailwind, PostgreSQL/PostgREST, pgvector
- Main authenticated shell lives at `/` via `src/app/page.tsx`
- `src/app/dashboard/*` routes are compatibility redirects to `/`; do not build new standalone dashboard screens there
- Keep architecture aligned with `src/lib/{bot,kb,ops,shared}`, `src/hooks`, and `src/components/{auth,navigation,ui,dashboard}`
- Prefer extending existing domain folders over creating new top-level structures

## Architectural Boundaries

Allowed:

- `components` -> `hooks`
- `components` -> pure formatting/calculation helpers from `lib/ops` only when there is no IO, DB access, or query configuration
- `hooks` -> fetch `/api/*` or use approved client query patterns
- `app/api` -> `lib/ops`, `lib/kb`, `lib/shared`
- `lib/ops`, `lib/kb`, `lib/bot` -> `lib/shared`
- `lib/bot/core` -> domain `bot-adapter` files, not business services directly

Avoid:

- `components` calling DB/PostgREST directly
- `components` importing server-only modules
- `components` importing `lib/kb` or `lib/bot` directly unless the existing architecture already makes that component the integration point
- `lib/shared` depending on `lib/ops`, `lib/kb`, or `lib/bot`
- new parallel architectures when an existing domain folder already owns the problem

When the current code already violates a boundary, do not do broad cleanup unless it is required for the task. Fix the local area and move it toward the target structure.

## Route And Navigation Rules

- Treat `/` as the main app shell
- Keep dashboard section switching compatible with the single-shell model described in `docs/DEVELOPER_GUIDE.md`
- Do not introduce new isolated pages for dashboard sections when the feature belongs inside the existing shell
- Preserve compatibility redirects in `src/app/dashboard/*` unless the user explicitly wants routing changed

## Data Access Rules

### Client-side

- Prefer TanStack Query patterns already used in the repo
- Reuse existing query keys and query option helpers where available
- For reference data, follow the long-lived cache patterns from `docs/DEVELOPER_GUIDE.md`
- For plans aggregates, prefer `v_monthly_plan_hours` and existing plan query abstractions instead of re-aggregating `daily_tasks`

### API routes

For protected routes, default to this pattern:

1. `isRequestAuthorized(req)`
2. `getDbUserId(req)` when user-scoped access is needed
3. rate limit via `getRequesterKey()` + `checkRateLimit()`
4. `logger` for errors and operational logging
5. `getServerDb()` imported as `getDb` for server PostgREST access

Rules:

- Never use Azure AD OID as the application DB user id
- Do not trust user ids from request body or query params without verifying them against the authenticated context
- Do not import the browser PostgREST client into server code
- Do not add unauthenticated mutating endpoints unless the user explicitly requests that model

## UI Rules

- `.claude/rules/ui-design.md` is the active UI source of truth
- First look for an existing shared component in `src/components/dashboard/shared` before building a one-off pattern
- Reuse existing UI primitives such as `Button`, `Modal`, `BottomDrawer`, and `Spinner`
- Prefer `cn(...)` and existing utility classes over ad hoc styling
- Prefer explicit transition properties over `transition-all`
- Keep keyboard accessibility, visible focus states, and `aria-label` coverage for interactive controls
- When a new UI pattern does not fit the current standard, stop and update the standard with the user instead of improvising a new visual system

## Refactoring Policy

- Do not perform large mechanical refactors just to satisfy an arbitrary line-count rule
- If a touched file is already too large or mixed-responsibility, extract the new responsibility into a nearby module when that clearly reduces complexity
- Favor incremental refactors that preserve behavior and local ownership
- Keep new modules narrowly scoped and colocated with the owning feature/domain

## Documentation Sync

Update docs when relevant:

- structural/module changes -> `docs/ARCHITECTURE.md`
- architectural decisions or intentional deviations -> `docs/DECISIONS.md`
- user-facing workflow or behavior changes -> `docs/USER_GUIDE.md`
- dashboard help content affected -> `src/components/dashboard/header/HelpContent.tsx`
- manual build/change notes shown in UI affected -> `MANUAL_BUILD_CHANGELOG_ITEMS` in `src/components/dashboard/activity/ActivityContent.tsx`
- new UI standard/component pattern -> `demo-design-system.html` and `.claude/rules/ui-design.md`
- new domain term or alias needed for navigation in the codebase -> `.claude/rules/glossary.md`

Do not update docs mechanically when nothing user-visible or structural changed.

## Verification

Before claiming success after code changes, run what is appropriate for the scope:

- `npm run typecheck` for TypeScript changes
- `npm run lint` for repo code changes
- `npm run build` after significant architectural or UI work
- `npm run test:e2e` when touching flows covered by Playwright or when behavior risk is high
- `mcp__postgres__query` to verify DB schema — never read `.sql` migration files, always check the actual database state

If a relevant check fails, fix it or report the blocker clearly.

## Practical Defaults

- Prefer small, local edits over broad rewrites
- Reuse existing naming and file placement conventions
- Preserve compatibility behavior unless the user asked to change it
- Ignore unrelated dirty worktree changes
- When in doubt, follow the existing implementation style in the nearest active module rather than inventing a new pattern

## How To Work With AI

Use these defaults for day-to-day vibe coding in this repo:

- Hard rule: do not pull, sync, merge, rebase, push, or otherwise synchronize code with any remote without the user's explicit permission
- Hard rule: do not propose "just syncing" as a default action; first discuss the situation, explain the options, and wait for the user's approval
- Hard rule: no remote-changing or remote-syncing git action is allowed without prior discussion and a clear user approval for that specific action
- Start by reading the nearest relevant files, not by proposing a fresh architecture
- Prefer implementing the requested change directly when the intent is clear
- Ask the user before changing architecture, routing model, data model, or UI standard
- Do not rename, move, or split files unless that improves the task materially
- Do not introduce new abstractions for hypothetical future reuse
- Prefer matching existing local patterns over introducing a cleaner but unrelated pattern
- If there are two plausible approaches, choose the one with the smaller diff and lower behavior risk
- When touching UI, preserve the current panel model and interaction flow unless the user explicitly asks for redesign
- When touching API or DB code, optimize for correctness and compatibility first, cleanup second
- If the repo has an established helper/component/layout for the job, use it instead of creating a new one

Ask before proceeding when:

- the task requires changing a documented architectural decision
- the task conflicts with existing user changes in the same area
- the task needs a brand-new visual pattern that is not covered by the current UI system
- the requirement is ambiguous enough that the wrong choice would cause rework

Do not ask when:

- the requested change is local and the nearest pattern is clear
- the work is a straightforward bug fix, wiring change, UI text update, or small extension of an existing module
- the best implementation is obvious from the surrounding code
