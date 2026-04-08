

# ===== FILE: ARCHITECTURE.md =====

# ARCHITECTURE.md — Жива карта проекту CS Platform

> **Для AI:** Читай цей файл повністю перед роботою.
> Єдине джерело правди про структуру, потоки даних і межі модулів.
> При суперечності між цим файлом і іншим текстом — цей файл має пріоритет.

> **Оновлення:** дописати рядок в розділ "Зміни" після кожної структурної зміни.

---

## Концепція — модульна платформа

Платформа управління задачами, звітністю і KPI відділу ІБ.
Фізично — один Next.js додаток. Архітектурно — шари з чіткими межами.

```
┌──────────────────────────────────────────────────────────┐
│                    TRANSPORT LAYER                        │
│  Telegram · Teams · Web UI · Voice (ElevenLabs)          │
└────────────┬──────────────┬──────────────┬───────────────┘
             │              │              │
             ▼              ▼              ▼
┌────────────────┐  ┌──────────────┐  ┌─────────────────┐
│   BOT-CORE     │  │  API ROUTES  │  │   REACT HOOKS   │
│  router        │  │  app/api/*   │  │   + COMPONENTS  │
│  registry      │  │              │  │                 │
│  permissions   │  │              │  │                 │
│  8 tools       │  │              │  │                 │
└───────┬────────┘  └──────┬───────┘  └────────┬────────┘
        │                  │                   │
        ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────────┐
│                    DOMAIN SERVICES                        │
│  lib/ops/       · lib/kb/                                 │
└────────────────────────────┬─────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────┐
│                    DATA LAYER                             │
│  lib/shared/supabase.ts · lib/shared/db-server.ts       │
│  lib/shared/ai/client.ts · lib/kb/embedder.ts            │
│  lib/shared/auth/ (Azure AD + JWT)                       │
└──────────────────────────────────────────────────────────┘
```

**Стек:** Next.js 15 · React 19 · TypeScript · PostgreSQL 16 + PostgREST + pgvector · Tailwind CSS
**Деплой:** Hetzner Cloud VPS (CAX11 ARM) · Node.js v20 · PM2 6.0 · HTTPS на порту 443

---

## Дерево файлів

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # 42 API routes
│   │   ├── auth/                 #   Azure AD → PostgREST JWT (token, check, cookie)
│   │   ├── telegram/             #   Webhook + notify/* + verify-code + permissions
│   │   ├── teams/                #   Webhook + link
│   │   ├── kb/                   #   Categories, documents, [id]/process, query-log
│   │   │   └── laws/             #   Законодавство: search, fetch, related, check-update, import, completeness
│   │   ├── reports/              #   generate, monthly, pivot, month-summary, company-notes
│   │   ├── kpi/                  #   KPI calculation endpoint
│   │   ├── plans/                #   Plans count
│   │   ├── calendar/             #   Working days, timesheet
│   │   ├── cabinet/              #   Stats, absences
│   │   ├── planner/             #   Entries, tasks, drafts, templates, meetings, sync
│   │   ├── presence/             #   Heartbeat, leave, online
│   │   ├── meetings/             #   Graph API: summary, transcript, employees
│   │   ├── ai/                   #   task-cleanup, task-assistant, activity-analysis
│   │   ├── bot/                  #   notification-channel
│   │   ├── files/                #   extract-text
│   │   ├── build/                #   changelog
│   │   └── db/                   #   Authenticated PostgREST proxy ([...path])
│   ├── dashboard/                # Main SPA page
│   ├── login/                    # Azure AD login
│   ├── plans/                    # Plans page
│   ├── reports/                  # Reports page
│   ├── kpi/                      # KPI page
│   └── references/               # References page
│
├── components/                   # React UI (4 папки)
│   ├── auth/                     #   Login UI: LoginContainer, LoginForm, LoginHeader
│   ├── navigation/               #   HorizontalNav
│   ├── ui/                       #   Design system: Button, Modal, BottomDrawer
│   └── dashboard/                #   Dashboard layout + all dashboard-specific UI
│       ├── DashboardContent.tsx  #     Main dashboard shell
│       ├── DashboardHeader.tsx   #     Header with user info
│       ├── sections.tsx          #     Section routing (which component for which tab)
│       ├── activity/             #     ActivityContent, ActivityFeed
│       ├── bot/                  #     BotSettingsContent (standalone nav section)
│       ├── header/               #     ActiveUsersList, BotSection, HelpContent
│       ├── kb/                   #     KBContent, KBAnalyticsContent, KBSectionContent
│       │   ├── KBLawsContent     #       Вкладка "Законодавство" (search + library)
│       │   ├── LawSearchPanel    #       Ввід URL/номера, групування зв'язків, імпорт
│       │   ├── LawLibraryTable   #       Таблиця-дерево з перевіркою оновлень
│       │   └── LawImportProgress #       Прогрес-бар імпорту
│       ├── kpi/                  #     KPIContent + visualizations
│       ├── plans/                #     PlansContent + details + Tasks
│       │   └── details/          #       MonthlyPlanDetails, QuarterlyPlanDetails, AnnualPlanDetails
│       │       └── components/   #         PlanCompanySection, PlanProcedureSection, etc.
│       ├── references/           #     ReferencesContent + ReferencesTabs + shared shells
│       │   ├── calendar/         #       CalendarReferenceContent + sub-components
│       │   ├── companies/        #       CompaniesReferenceContent + infrastructure/
│       │   ├── employees/        #       EmployeesReferenceContent + EmployeeCard + EmployeeDetails
│       │   ├── procedures/       #       ProceduresReferenceContent + EtalonsReferenceContent
│       │   ├── MeetingsContent.tsx #     Meetings (flat)
│       │   └── ProjectsReferenceContent.tsx # Projects (flat)
│       ├── cabinet/              #     CabinetContent, stats, absences, profile
│       ├── planner/             #     PlannerContent, Grid, Blocks, Sidebar, Toolbar, Tasks
│       ├── reports/              #     ReportsContent + report tabs + SummaryTabContent
│       └── shared/               #     TwoPanelLayout, DashboardTopTabs, etc.
│
│   # Dashboard navigation sections (by role):
│   # chief:   Активність / Плани / Звіти / Зведена / KPI / Довідники / База знань / Бот
│   # head:    Активність / Плани / Звіти / Зведена / KPI / Довідники / База знань
│   # employee: Активність / Плани
│
│   # Grouping rules for dashboard/:
│   # 1. Nav section → always a folder
│   # 2. 3+ related files → folder
│   # 3. Shell/layout → root file
│
├── hooks/                        # React hooks
│   ├── usePlans.ts               #   Plan CRUD + queries (~290 lines, refactored)
│   ├── useKPI.ts                 #   KPI data fetching
│   ├── useEmployees.ts           #   Employee cache (staleTime: Infinity)
│   ├── usePresence.ts            #   Online status polling (90s)
│   ├── useAuthRefresh.ts         #   JWT refresh (40min interval)
│   ├── useCompanies.ts           #   Company data (staleTime: Infinity)
│   ├── usePivotReport.ts         #   Pivot report data
│   ├── useAbsences.ts            #   Vacation requests (planned_absences)
│   ├── useWorkCalendar.ts        #   Working days calendar
│   ├── useInfrastructure.ts      #   Company infrastructure
│   ├── useLawSearch.ts           #   Law search (URL/number) + related acts + docNumber
│   ├── useLawLibrary.ts          #   Laws table + update check + completeness checker
│   ├── useLawImport.ts           #   Law import (URL or file) with progress tracking
│   └── planning/                 #   Plan-specific hooks
│       ├── usePlanFilters.ts     #     Plan tree filtering
│       ├── usePlanNavigation.ts  #     Year/quarter/month navigation
│       ├── useMonthlyPlanData.ts #     Monthly plan data loading (NEW)
│       ├── useMonthlyPlanHandlers.ts # Monthly plan handlers (NEW)
│       ├── useQuarterlyPlanCopy.ts # Copy quarterly plan logic (NEW)
│       └── useQuarterlyMonthStats.ts # Month stats for quarterly view (NEW)
│
├── lib/                          # Core business logic
│   ├── bot/                      # ═══ BOT MODULE ═══
│   │   ├── core/                 #   Відповідає за: оркестрацію, tools interface
│   │   │   │                     #   НЕ знає: Telegram/Teams специфіку
│   │   │   ├── router.ts         #   AI orchestration (multi-turn, max 5 rounds, 45s)
│   │   │   ├── registry.ts       #   Tool registry — імпортує з domain/bot-adapter.ts
│   │   │   ├── tool-registry.ts  #   Tool discovery, getDirectTools()
│   │   │   ├── permissions.ts    #   Role → enabled tools mapping
│   │   │   ├── system-prompt.ts  #   AI system prompt builder
│   │   │   ├── types.ts          #   BotTool, FormattedResult, DocumentResult
│   │   │   └── index.ts          #   Barrel re-export
│   │   ├── audio/                #   Voice transcriber (Telegram)
│   │   ├── shared/               #   Спільні хелпери для всіх bot-adapter.ts
│   │   │   ├── format-base.ts    #     fmtHours, kpiIcon, monthName, miniBar, ...
│   │   │   ├── format-helpers.ts #     esc() HTML + re-export format-base
│   │   │   ├── fuzzy-match.ts    #     findBestMatch() — нечіткий пошук по масиву
│   │   │   └── index.ts          #     Barrel re-export
│   │   ├── notifications/        #   Мультиканальний нотифікатор
│   │   │   ├── send.ts           #     sendNotification / sendNotificationsToAll
│   │   │   └── index.ts          #     Barrel re-export
│   │   ├── telegram/             # ═══ TELEGRAM ADAPTER ═══
│   │   │   │                     #   Відповідає за: Telegram API, клавіатури
│   │   │   │                     #   НЕ знає: бізнес-логіку, SQL
│   │   │   ├── bot.ts            #   Webhook handler, inline menu builder
│   │   │   ├── auth.ts           #   chatId → user verification
│   │   │   ├── ai-router.ts      #   processMessage() → runBotRouter()
│   │   │   ├── direct-router.ts  #   Button commands without AI
│   │   │   ├── crypto.ts         #   AES-256-GCM for personal API keys
│   │   │   └── index.ts          #   Barrel re-export
│   │   ├── teams/                # ═══ TEAMS ADAPTER ═══
│   │   │   │                     #   Відповідає за: Teams API, Adaptive Cards
│   │   │   │                     #   НЕ знає: бізнес-логіку, SQL
│   │   │   ├── bot.ts            #   CloudAdapter, card builder
│   │   │   ├── auth.ts           #   Azure OID → user lookup via RPC
│   │   │   ├── ai-router.ts      #   processTeamsMessage() → runBotRouter()
│   │   │   ├── direct-router.ts  #   Button commands, teamsKey() strip emoji
│   │   │   └── index.ts          #   Barrel re-export
│   │   └── voice/                # ═══ VOICE BOT (ElevenLabs) ═══
│   │       │                     #   Канал до KB, НЕ фільтрує, НЕ синтезує
│   │       ├── elevenlabs-client.ts  #   getSignedUrl(), getConversationDetails()
│   │       └── session-logger.ts     #   logVoiceSession(), getVoiceSessions()
│   │
│   ├── kb/                       # ═══ KNOWLEDGE BASE (незалежна система) ═══
│   │   │                         #   Відповідає за: індексацію, embedding, chunking
│   │   │                         #   НЕ знає: хто запитує (бот, API, адмін)
│   │   ├── processor.ts          #   Parse → clean → chunk → embed → store
│   │   ├── chunker.ts            #   Parent-child chunking (345 lines)
│   │   ├── embedder.ts           #   Voyage multilingual-2 (1024d), batch 100
│   │   ├── table-converter.ts    #   Table → Markdown serialization
│   │   ├── contextual-prefix.ts   #   AI-generated chunk context (Claude Haiku)
│   │   ├── search-locators.ts     #   Meta-query handler + legal article locator (deterministic)
│   │   └── bot-adapter.ts        #   Bot integration (kbSearchTool)
│   │
│   ├── ops/
│   │   ├── laws/                  # ═══ LAWS MODULE (Законодавство) ═══
│   │   │   └── fetcher-client.ts  #   Proxy to law-fetcher microservice on DB VPS
│   │   │                          #   search (by URL/number), fetch, related, check-update, extractDocNumber
│   │
│   ├── ops/                      # ═══ OPS MODULE ═══ (Operations: планування, звіти, KPI, активність)
│   │   │                         #   Відповідає за: бізнес-логіка, розрахунки
│   │   │                         #   НЕ знає: UI, транспорт
│   │   ├── index.ts              #   Master barrel (re-exports all submodules)
│   │   ├── employees.service.ts  #   Employee data helpers
│   │   ├── infrastructure.service.ts  # Company infrastructure data
│   │   ├── activity/             #   ─── Activity tracking domain ───
│   │   │   ├── index.ts          #     Barrel re-export
│   │   │   ├── types.ts          #     Types and interfaces
│   │   │   ├── mappers.ts        #     Row-to-event mappers
│   │   │   ├── feed.ts           #     getActivityFeed + fallback chain
│   │   │   ├── stats.ts          #     getActivityStats, getDepartmentsForFilter
│   │   │   └── bot-adapter.ts    #     Bot integration (getActivityTool)
│   │   ├── kpi/                  #   ─── KPI calculation domain ───
│   │   │   ├── index.ts          #     Barrel re-export
│   │   │   ├── service.ts        #     Main KPI orchestrator
│   │   │   ├── types.ts          #     KPI row types
│   │   │   ├── helpers.ts        #     Pure KPI helpers
│   │   │   ├── compute-roles.ts  #     Role-specific computation
│   │   │   └── bot-adapter.ts    #     Bot integration (getKpiTool)
│   │   ├── reports/              #   ─── Reports generation domain ───
│   │   │   ├── index.ts          #     Barrel → types, company-report, employee-report, quarterly-plan
│   │   │   ├── types.ts          #     Shared types, getReportClient, fetchTaskCompanyLinks
│   │   │   ├── service.ts        #     Quarterly data from PostgreSQL
│   │   │   ├── company-report.ts #     getCompanyReportData
│   │   │   ├── company-list.ts   #     getAvailableCompanyReports
│   │   │   ├── employee-report.ts #    getEmployeeReportData
│   │   │   ├── employee-list.ts  #     getAvailableEmployeeReports + periods
│   │   │   ├── quarterly-plan.ts #     getQuarterlyPlanReportData, getQuarterlyReportData
│   │   │   ├── company-notes.ts  #     AI notes for company reports (import directly)
│   │   │   ├── quarterly-notes.ts #    AI notes for quarterly reports (import directly)
│   │   │   ├── docx.ts           #     DOCX generation (server-only, import directly)
│   │   │   ├── pdf.ts            #     PDF barrel (server-only, import directly)
│   │   │   ├── pdf-helpers.ts    #     Shared PDF config, fonts, drawing utils
│   │   │   ├── pdf-company.ts    #     generateCompanyReportPDF
│   │   │   ├── pdf-employee.ts   #     generateEmployeeReportPDF
│   │   │   ├── pdf-quarterly.ts  #     generateQuarterlyPlanPDF, generateQuarterlyReportPDF
│   │   │   ├── hour-distribution.ts #  Hour distribution calculations (було lib/utils/)
│   │   │   └── bot-adapter.ts    #     Bot integration (getEmployeeReportTool, generateReportTool, generateQuarterlyTool)
│   │   ├── digest/               #   ─── Weekly digest domain ───
│   │   │   └── service.ts        #     buildDigestMessage(db, user, now) — HTML per role
│   │   ├── contracts/            #   ─── SOC contract mapping domain ───
│   │   │   ├── index.ts          #     Barrel re-export
│   │   │   ├── soc-catalog.ts    #     Static catalog: SERVICE_CATEGORIES, CONTRACT_SERVICES
│   │   │   └── soc-matcher.ts    #     findServiceByKeywords() — match task text → contract service
│   │   ├── plans/                #   ─── Planning domain (було lib/plans/) ───
│   │   │   ├── service-core.ts   #     Core plan CRUD operations
│   │   │   ├── monthly-mappers.ts #    Monthly plan data mappers
│   │   │   ├── quarterly-mappers.ts #  QuarterlyBaseRow → QuarterlyPlan mappers
│   │   │   ├── quarterly-fetcher.ts #  Standalone DB fetch functions
│   │   │   ├── plan-factories.ts #     Plan creation factories
│   │   │   ├── monthly-plan-helpers.ts # updateMonthlyPlanCompanies/Projects
│   │   │   ├── planning-utils.ts #     Plan calculation utilities (було lib/utils/)
│   │   │   ├── bot-adapter.ts    #     Bot integration (getPlansTool, getHoursTool)
│   │   │   └── index.ts          #     Barrel re-export
│   │   ├── planner/              #   ─── Planner domain (calendar entries, tasks, drafts, sync) ───
│   │   │   ├── calendar-entries.ts    # CRUD for weekly_calendar_entries
│   │   │   ├── calendar-entries-write.ts # Batch create/update entries
│   │   │   ├── calendar-shared.ts     # Graph helpers, time utils
│   │   │   ├── calendar-sync.ts       # Delta PULL from Outlook
│   │   │   ├── calendar-sync-reconcile.ts # Event matching logic
│   │   │   ├── calendar-sync-backfill.ts  # Subject/transcript backfill
│   │   │   ├── calendar-push.ts       # Batch PUSH to Outlook ($batch API)
│   │   │   ├── weekly-suggest.ts      # AI suggest (auto-fill)
│   │   │   ├── weekly-suggest-strategies.ts # Suggest strategies
│   │   │   ├── meeting-details.ts     # Meeting info lookup
│   │   │   ├── meeting-summary.ts     # AI meeting summary
│   │   │   ├── task-service.ts        # Planner task CRUD
│   │   │   ├── task-validation.ts     # Task validation rules
│   │   │   ├── task-templates.ts      # Task template definitions
│   │   │   └── drafts.ts             # Draft tasks management
│   │   ├── presence/             #   In-memory presence (heartbeat 90s, TTL 4min) (було lib/presence/)
│   │   ├── tasks/                #   Task service (було lib/tasks/)
│   │   ├── graph/                #   ─── Microsoft Graph API adapter (було lib/graph/) ───
│   │   │   ├── client.ts         #     Graph HTTP client (token → requests)
│   │   │   ├── auth-service.ts   #     Token acquisition
│   │   │   ├── users-service.ts  #     User lookup, employee photos
│   │   │   ├── meetings.ts       #     Meeting aggregations
│   │   │   ├── meetings-service.ts #   Meeting list + details
│   │   │   ├── transcriptions-service.ts # Meeting transcripts
│   │   │   ├── calendar-service.ts #   Calendar events
│   │   │   ├── sharepoint-service.ts #  SharePoint files
│   │   │   ├── sharepoint-drive.ts  #  SharePoint drive helpers
│   │   │   ├── sharepoint-reports.ts # Report file operations
│   │   │   ├── sharepoint-attachments.ts # Attachment helpers
│   │   │   ├── sharepoint-types.ts  #  SharePoint type definitions
│   │   │   └── index.ts          #     Barrel re-export
│   │   ├── format-name.ts        #   Name formatting utilities (було lib/utils/)
│   │   ├── photo-resize.ts       #   Employee photo resize (було lib/utils/)
│   │   ├── document-number.ts    #   Document number generation (було lib/utils/)
│   │   ├── working-days.ts       #   Working day calculations (було lib/utils/)
│   │   ├── calendar-queries.ts   #   Calendar SQL helpers
│   │   ├── reference-queries.ts  #   Reference SQL helpers
│   │   └── telegram-queries.ts   #   Telegram SQL helpers
│   │
│   └── shared/                   # ═══ SHARED INFRASTRUCTURE ═══
│       │                         #   Cross-cutting: auth, config, AI clients, utils
│       │                         #   НЕ знає: бізнес-логіку, UI
│       ├── ai/                   #   AI client (Anthropic claude-3-haiku + OpenAI)
│       ├── api/                  #   request-guards (auth middleware)
│       ├── auth/                 #   Azure AD, JWT, sessions
│       │   ├── index.ts          #     MSAL init, acquireToken, setSession
│       │   ├── msal.ts           #     MSAL configuration helpers
│       │   ├── session.ts        #     Session management
│       │   ├── use-auth.ts       #     useAuth hook
│       │   └── config.ts         #     MSAL config (NEXT_PUBLIC_AZURE_*)
│       ├── config/               #   Centralized env config (Phase 2 refactor)
│       ├── logger.ts             #   Structured logging (dev mode only)
│       ├── providers/            #   React Context (TanStack Query provider)
│       ├── supabase.ts           #   Client-side PostgREST (anon key + custom JWT)
│       ├── db-server.ts           #   Server-side PostgREST (service_role, singleton)
│       ├── utils.ts              #   cn() utility (clsx + tailwind-merge)
│       └── utils/                #   Cross-cutting utilities only
│           ├── error-message.ts  #     getErrorMessage helper
│           ├── fetch-with-timeout.ts # fetchWithTimeout helper
│           └── index.ts          #     Barrel re-export
│
├── services/                     # External service integrations (legacy path)
│   └── graph/ → MOVED to lib/graph/ (Phase 3) → lib/ops/graph/ (Phase 8)
│
├── types/                        # TypeScript type definitions
│   ├── supabase.ts               #   Generated DB schema types (legacy name)
│   ├── planning.ts               #   Planning domain types
│   ├── azure.ts                  #   Azure AD types
│   └── infrastructure.ts         #   Company infrastructure types
│
└── providers/                    # React Context
    └── QueryProvider.tsx          #   TanStack Query provider
```

---

## Межі модулів — хто що знає

| Модуль | Відповідає за | НЕ знає про | Імпортує з |
|--------|--------------|-------------|------------|
| `components/` | UI рендеринг | SQL, зовнішні API | `hooks/`, `types/`, `ui/` |
| `hooks/` | Стан, запити, кеш | SQL, зовнішні API | `@tanstack/query`, `fetch` |
| `app/api/` | HTTP, валідація, auth | UI, React | `lib/ops/`, `lib/shared/auth/` |
| `bot/core/` | Оркестрація, реєстр | Telegram/Teams API, домени | `domain/bot-adapter`, `bot/shared/` |
| `domain/bot-adapter.ts` | Bot integration конкретного домену | Канали (Telegram/Teams) | `bot/core/types`, `bot/shared/`, `domain/*` |
| `bot/telegram/` | Telegram API, клавіатури | Бізнес-логіка | `bot/core/types`, `bot/core/router` |
| `bot/teams/` | Teams API, Adaptive Cards | Бізнес-логіка | `bot/core/types`, `bot/core/router` |
| `bot/notifications/` | Мультиканальна доставка | Бізнес-логіка | `bot/telegram/bot`, botframework-connector |
| `bot/voice/` | ElevenLabs signed URL, сесії | Бізнес-логіка, KB | `lib/shared/config`, `lib/shared/db-server` |
| `app/api/voice/` | Voice канал до KB (транспорт) | KB internals | `lib/kb/`, `bot/voice/` |
| `lib/ops/` | Бізнес-логіка Platform | UI, транспорт, KB | `lib/shared/db-server`, `lib/shared/ai/` |
| `lib/kb/` | Індексація, embedding (незалежна) | Хто запитує | `lib/shared/db-server`, `lib/shared/ai/` |
| `lib/shared/auth/` | Azure AD, JWT, сесії | Все інше | `msal-browser`, `jose` |
| `lib/shared/` | Інфраструктура (config, logger, utils) | Бізнес-логіка | зовнішні lib тільки |

---

## Заборонені напрямки імпорту

```
✅ bot/core/registry → domain/bot-adapter  (через реєстр)
✅ domain/bot-adapter → bot/shared/        (format helpers)
✅ domain/bot-adapter → domain/*           (своя бізнес-логіка)
✅ lib/ops/ → lib/shared/                  (infra: db-server, ai, config, logger)
✅ lib/kb/ → lib/shared/                   (infra: db-server, ai, config, logger)
✅ lib/bot/ → lib/shared/                  (infra: config, logger)
✅ app/api/ → lib/shared/auth/             (auth middleware)

❌ components/ → lib/ops/                  (тільки через hooks/)
❌ bot/core/ → domain/*                    (тільки через bot-adapter)
❌ domain/* → bot/core/                    (домен не знає про бота)
❌ kb/ → bot/* або platform/*             (KB незалежна)
❌ platform/* → kb/                        (KB незалежна)
❌ lib/ops/ → app/api/                    (сервіс не знає хто викликає)
❌ lib/shared/ → lib/ops/                  (shared не залежить від бізнес-логіки)
❌ lib/shared/ → lib/kb/                   (shared не залежить від бізнес-логіки)
❌ lib/shared/ → lib/bot/                  (shared не залежить від бізнес-логіки)
```

---

## Потоки даних

### Потік 1 — Авторизація

```
Azure AD login → redirect → /api/auth/token (POST Azure JWT)
  → validate Azure token → lookup user in v_user_details
  → generate custom PostgREST JWT (HS256, 50min TTL)
  → set cookies: auth_token + x-user-id
  → client: setSupabaseSession(jwt) — applies Bearer token
  → useAuthRefresh: refresh кожні 40хв (10хв до expiry)
```

### Потік 2 — Telegram повідомлення

```
POST /api/telegram/webhook
  → verify x-telegram-bot-api-secret-token
  → rate limit (10/min per chat, 100/min global)
  → resolveUserBasic(chatId) → { userId, role, name }
  ↓
  1. Callback query? → handleCallbackQuery("direct:<tool>")
     → execute tool → respond
  2. /doc prefix? → kb_search.execute({ query }) → respond
  3. Direct text match? → execute tool → respond
  4. AI routing → processMessage()
     → decrypt personal API key (if set)
     → runBotRouter({ message, tools, memory })
     → AI tool-calling loop (max 5 rounds, 45s timeout)
     → FormattedResult|DocumentResult → respond
  ↓
  sendMessage() with cost footer (🤖 model · $X.XX)
```

### Потік 3 — Створення плану

```
UI: MonthlyPlanDetails → usePlans.createPlan()
  → POST to PostgREST (monthly_plans + daily_tasks)
  → on success: fire-and-forget POST /api/telegram/notify/plan-created
  → Telegram bot sends notification to assignees (is_active subscribers)
```

### Потік 3a — Життєвий цикл задачі (daily_tasks)

```
task_type: draft → incomplete → done
source: manual | template | chief | head | manager | calendar

Completion rules:
  manual/template: auto-completed коли hours > 0 AND description filled
  chief/head:      done ТІЛЬКИ через accept від керівника
  calendar:        auto-completed на основі годин

Chief/Head flow:
  Керівник створює задачу (source='chief'|'head', task_type='draft')
  → Співробітник заповнює (hours, description) → task_type='incomplete'
  → Керівник accept ✓ → task_type='done'
  → Керівник reject ✗ → task_type='draft' (повернення)
```

### Потік 4 — Генерація звіту

```
Bot tool generate_report / API /api/reports/generate
  → monthly-report.service: SQL queries for period data
  → company-notes.service: AI synthesis (Claude) per company
  → pdf-report.service: PDFKit rendering
    → Ukrainian locale, Cyrillic fonts, 6-column table, signatures, VAT
  → Return DocumentResult { buffer, filename, caption }
```

### Потік 5 — KB пошук

KB — єдине джерело відповідей. Канали — тільки транспорт:

```
Канали (кожен — лише передає запит і віддає відповідь):
  Telegram  → lib/kb/bot-adapter.ts   → searchAndAnswer()
  Teams     → lib/kb/bot-adapter.ts   → searchAndAnswer()
  Web chat  → app/api/kb/*            → searchAndAnswer()
  Voice bot → app/api/voice/kb-search → searchAndAnswer()

Канал НЕ фільтрує, НЕ вирішує scope, НЕ синтезує.
Вся логіка — всередині searchAndAnswer().
Voice-канал додатково: retry з переформулюванням + очистка тексту для TTS.
```

```
searchAndAnswer(query, options):
  → translateAndExpand(query): GPT-4o-mini → Ukrainian
  → embedText(query): Voyage voyage-4-lite (1024d Matryoshka, input_type=query)
  → match_kb_documents RPC (SECURITY DEFINER):
      vector similarity (cosine, 1024 dims, HNSW index)
    + BM25 full-text (tsvector 'uk')
    + RRF fusion (k=60) → top 20 chunks
  → Rerank: Voyage rerank-2.5 (top 6 для синтезу)
  → AI synthesis: Claude claude-haiku-4-5-20251001
    system prompt enforces citation from context only
  → FormattedResult with sources + cost footer
  ↓
  Retry logic: uk_0.35_cat → uk_0.25_cat → uk_0.35 → uk_0.25
  Quality gate: topScore < 0.30 → "не знайдено" (без синтезу)
```

---

## Контракт бот-інструменту

```typescript
interface BotTool {
  name: string;                          // unique tool ID
  label: string;                         // display name
  description: string;                   // for AI tool-calling
  supportedScopes: ToolScope[];          // 'own' | 'department' | 'all'
  parameters: Record<string, unknown>;   // JSON Schema for AI
  execute(args, ctx: ToolContext): Promise<FormattedResult | DocumentResult>;

  directCommand?: {                      // inline button (no AI)
    buttonLabel: string;                 // e.g. "📄 Мій звіт"
    args: Record<string, unknown>;       // pre-filled args
  };
  prefixCommand?: {                      // prefix command (no AI)
    command: string;                     // e.g. '/doc'
    argKey: string;                      // field name in args
    hint: string;                        // e.g. 'вимоги до паролів'
  };
}
```

**Типи результатів:**
- `FormattedResult { __type: 'formatted', text, parseMode }` — готовий текст
- `DocumentResult { __type: 'document', buffer, filename, caption }` — файл

**Правило:** tools повертають ГОТОВИЙ результат. AI-синтез — всередині tool.

---

## Зовнішні API

| Сервіс | Модуль | Env змінна |
|--------|--------|------------|
| PostgREST | `lib/shared/supabase.ts`, `lib/shared/db-server.ts` | `POSTGREST_URL`, `NEXT_PUBLIC_API_URL`, `POSTGREST_SERVICE_KEY`` |
| Azure AD | `lib/shared/auth/` | `NEXT_PUBLIC_AZURE_CLIENT_ID`, `_TENANT_ID` |
| Anthropic | `lib/shared/ai/client.ts` | `ANTHROPIC_API_KEY` |
| Voyage AI | `lib/kb/embedder.ts` | `VOYAGE_API_KEY` |
| Telegram | `lib/bot/telegram/` | `TELEGRAM_BOT_TOKEN`, `_WEBHOOK_SECRET`, `_ENCRYPTION_KEY` |
| Teams | `lib/bot/teams/` | `MICROSOFT_APP_ID`, `_APP_PASSWORD` |
| Microsoft Graph | `lib/ops/graph/` | (через Azure AD token) |

---

## Відома технічна заборгованість

| # | Обмеження | Де | Наслідок |
|---|-----------|-----|---------|
| 1 | ✅ `process.env` централізовано | `lib/shared/config/` | Phase 2 завершено |
| 2 | ✅ God objects розбиті | Фаза 4 рефакторингу завершена |
| 3 | Conversation memory в пам'яті | `bot/core/router.ts` | Втрачається при рестарті |
| 4 | Presence в пам'яті | `lib/ops/presence/` | Втрачається при рестарті |
| 5 | HS256 замість ES256 | `lib/shared/auth/` | PostgREST uses HS256 by default |
| 6 | ✅ `console.log` → `logger` | Всі файли | Phase 1 завершено |
| 7 | ✅ `lib/shared/auth/` розбита | msal.ts, session.ts, use-auth.ts | Phase 3 завершено |

---

## Зміни архітектури

| Дата | Зміна |
|------|-------|
| 2025-02 | Initial: Next.js + Supabase + Azure AD (later migrated to PostgREST) |
| 2025-02 | Custom PostgREST JWT (HS256), RLS на всіх таблицях |
| 2025-02 | KPI system (employee/head/chief), presence tracking |
| 2025-02 | Telegram bot + Teams bot (Jarvise) |
| 2025-02 | Task-level company distribution (daily_task_companies) |
| 2025-02 | Work rate system (user_profiles.work_rate) |
| 2026-02 | Bot-core: tool registry, AI router, direct commands |
| 2026-02 | Self-describing bot (кнопки з реєстру, /doc prefix) |
| 2026-02 | Knowledge Base: hybrid search, contextual retrieval |
| 2026-02 | Synology NAS deployment (PM2, deploy.sh) — REPLACED by Hetzner VPS |
| 2026-02 | KB analytics: query-log, retry logic, category fallback |
| 2026-03 | Architecture documentation (цей файл) |
| 2026-03 | Phase 4 refactoring: god objects split, barrel files, hook extraction |
| 2026-03 | Phase 5: lib/services/ → domain subfolders (activity/, kpi/, reports/, contracts/) |
| 2026-03 | 3-system architecture: bot-adapter.ts pattern, lib/bot/tools/ → domain adapters, lib/notifications/ → lib/bot/notifications/ |
| 2026-03 | Rename services/ → ops/, plans/presence/tasks/ → ops/*, audio/ → bot/audio/ |
| 2026-03 | Phase 8: lib/graph/ → lib/ops/graph/, 6 lib/utils/ files → ops domain locations |
| 2026-03 | Phase 9: lib/shared/ created — ai/, api/, auth/, config/, providers/, utils/, logger.ts, supabase.ts, db-server.ts, postgrest-client.ts, utils.ts grouped into shared/. lib/ now has exactly 4 folders: bot/, kb/, ops/, shared/ |
| 2026-03 | Phase 10: components/ → 4-folder structure (auth, navigation, ui, dashboard). All dashboard-specific UI consolidated into dashboard/. |
| 2026-03 | Phase 11: dashboard/ internal restructuring — bot/ and kb/ as standalone sections, references/ split into subfolders (calendar/, companies/, employees/, procedures/), bug fixes for broken relative imports. |
| 2026-03 | Weekly digest: новый модуль lib/ops/digest/, endpoint /api/digest/weekly, pm2 cron digest-cron (пн 09:00). |
| 2026-03 | Planned absences (vacation requests): planned_absences table, lib/ops/cabinet/absences.ts, /api/cabinet/absences/, hooks/useAbsences, CabinetVacation + CabinetApprovals UI. Workflow: employee → head/chief approve → 'О' в табель. |
| 2026-03 | ~~Weekly planner v1: weekly_plan_slots table~~ (REPLACED → Planner module). |
| 2026-03 | ~~Draft tasks v1~~ (REPLACED → `lib/ops/planner/drafts.ts`, `hooks/usePlannerDrafts.ts`). |
| 2026-03 | **Planner module** (was "Great Calendar"): `weekly_calendar_entries` table (plan slots + external events), delta PULL from Outlook, batch PUSH via $batch API, `calendar_sync_state` for delta tokens. Full module: `lib/ops/planner/` (calendar-entries, sync, push, suggest, tasks, drafts, templates, meetings), `components/dashboard/planner/` (PlannerContent, Grid, Blocks, Sidebar, Toolbar), `app/api/planner/` (entries, tasks, drafts, templates, meetings, sync), hooks (usePlanner, usePlannerSync, usePlannerTasks, usePlannerDrafts, useTaskTemplates). Route `/dashboard/planner`. |
| 2026-03 | **Planner v2 — tasks UI:** TasksModal (create/edit/collect), PlannerTasksDetail (confirm delete, edit button, task statuses via CSS classes .done/.draft/.approval/.rejected), PlannerSidebar (ClipboardCheck collect icon). API planner/tasks extended: planInfo returns companyIds, planProjects, planDocuments; tasks return project_id, document_number. PATCH entries now passes daily_task_id. Calendar entryStatus decoupled from tasks (calendar = planning only, tasks = separate). |
| 2026-03 | **Hetzner VPS migration:** Synology DS920+ → Hetzner Cloud CAX11 (ARM, Ubuntu 24.04). IP: 91.99.156.163. Порт змінено з 3000 на 443 (стандартний HTTPS). URL: `https://maxtitan.me` (без :3000). server.js обслуговує HTTPS напряму (без nginx). Hetzner Cloud Firewall: inbound TCP 22/443/3000 + ICMP, outbound TCP/UDP any. GRE тунель до MikroTik (10.77.0.0/24). Telegram webhook з явним ip_address. deploy.sh оновлено на Hetzner. |
| 2026-03 | **KB Laws module (Законодавство):** Мікросервіс `law-fetcher` на DB VPS (Express, порт 3100, PM2) — fetch законів з zakon.rada.gov.ua через Playwright, пошук по номеру/URL, парсинг зв'язків, перевірка оновлень. API routes `/api/kb/laws/` (search, fetch, related, check-update, import, GET list). UI вкладка "Законодавство" в KB — ввід URL/номера, групування зв'язків (Основні/Зміни/Усі), імпорт з прогресом, таблиця-дерево бібліотеки. Промпт бота — ієрархія юридичних документів. Contextual prefix — skip на rate limit замість 70s retry. |
| 2026-03 | **Security headers:** X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS, CSP-Report-Only, Permissions-Policy додані в `next.config.js`. Кеш-контроль `private, no-store` для динамічних сторінок. Прямий доступ до `/rest/v1` заблоковано (404 в `server.js`) — тільки через `/api/db/` authenticated proxy. Debug routes (`/api/debug/`) та `/env-check` видалені. |
| 2026-03 | **KB Laws v2 — file import + child documents:** Імпорт законів з файлу (fileContent замість URL). Parent-child зв'язки з metadata injection ("На виконання: ..."). Completeness checker API (`/api/kb/laws/completeness`) — перевірка відсутніх зв'язаних документів. UI: кнопка додавання дочірніх документів, індикатор повноти (missing count). `LawChildUploadModal` для файлового завантаження. `search-locators.ts` — детерміністичний пошук по номеру статті/пункту. |
| 2026-03 | **Plan status rename:** `'completed'` → `'done'` у всіх сервісах, запитах, UI, бот-адаптерах, звітах. Display text не змінився ("Виконано"). Зачіпає ~15 файлів: planning-utils, bot-adapter, cabinet/stats, kpi/service, reports/*, month-summary route. |
| 2026-03 | **Plans V2 — department filtering + sorting:** Не-chief користувачі бачать тільки процеси свого департаменту. Процедури і процеси відсортовані за алфавітом (Ukrainian `localeCompare('uk')`). Виконавці відсортовані за алфавітом. |
| 2026-03 | **Planner — native HTML5 drag:** `@dnd-kit` замінено на нативний HTML5 drag API (`draggable`, `onDragStart`, `dataTransfer`). Тип даних: `application/planner-slot`. |
| 2026-03 | **Planner sync timeout:** `usePlannerSync` — 30s AbortSignal.timeout для PULL/PUSH запитів. |
| 2026-03 | **PostgREST proxy config:** `/api/db/[...path]` підтримує config-based prefix (`config.db.direct ? '' : '/rest/v1'`). |
| 2026-03 | **Planner v3 — calendar flow redesign:** Design doc: `docs/plans/2026-03-20-planner-calendar-flow.md`. New column `needs_push` (boolean) on `weekly_calendar_entries` — tracks local changes needing Outlook sync. 7 tile statuses: distributed (blue), synced (green), modified (cyan, needs_push), returned (red, outlook_modified), templated (amber, task_template_id set), collected (purple, daily_task_id set), external (gray). Push now updates existing Outlook events (PATCH) instead of delete+create — `outlook_event_id` never cleared on edits. Pull detects deleted plan events in Outlook (clears outlook_event_id). Template picker writes `task_template_id` on entry (no daily_task creation). Collect without modal: groups entries by template, creates daily_tasks per group. Tile text shows template_title when set. Resize/drag on synced entries sets needs_push=true. Returned entries become editable on drag/resize (clears outlook_modified). ReadOnly: collected + external (without template). |


# ===== FILE: DECISIONS.md =====

# DECISIONS.md — Журнал архітектурних рішень

> **Для AI:** Читай ПЕРЕД тим як пропонувати зміни в архітектурі.
> Кожне рішення свідомо прийнято. Не пропонуй альтернативи без запиту.
>
> **Якщо пропозиція суперечить рішенню:**
> 1. Скажи про це явно
> 2. Поясни чому вважаєш що варто переглянути
> 3. Чекай підтвердження
>
> **Після нового рішення:** додай в кінець списку.

---

## Структура модулів

### [0] utils/graph → ops domain consolidation (2026-03-02)
**Рішення:** перемістити domain-specific файли ближче до їх споживачів
**Переміщено:**
- `lib/graph/` → `lib/ops/graph/` (Microsoft Graph API адаптер — виключно ops: meetings, reports, sharepoint, фото)
- `lib/utils/hour-distribution.ts` → `lib/ops/reports/hour-distribution.ts`
- `lib/utils/planning-utils.ts` → `lib/ops/plans/planning-utils.ts`
- `lib/utils/working-days.ts` → `lib/ops/working-days.ts`
- `lib/utils/format-name.ts` → `lib/ops/format-name.ts`
- `lib/utils/photo-resize.ts` → `lib/ops/photo-resize.ts`
- `lib/utils/document-number.ts` → `lib/ops/document-number.ts`
- `lib/utils/` залишає тільки справді cross-cutting: `error-message.ts`, `fetch-with-timeout.ts`

**Відкинуто:** залишити lib/graph/ та lib/utils/ на верхньому рівні lib/
**Чому:** "розміщуй код поруч з його споживачами" — якщо модуль має споживачів тільки в одному домені, він належить до цього домену. Graph API використовується виключно ops (зустрічі, звіти, SharePoint, фото співробітників). Переміщені utils — не загального призначення.
**Наслідок:** чистіший корінь lib/. `ops/` тепер більш самодостатній. Імпорти: `@/lib/graph/meetings` → `@/lib/ops/graph/meetings`.

---

## Аутентифікація

### [1] Custom PostgREST JWT замість Supabase Auth
**Рішення:** Server-side JWT (HS256) після Azure AD login
**Відкинуто:** Supabase Auth, NextAuth (migrated to PostgREST)
**Чому:** Azure AD — корпоративний IdP. PostgREST Auth не підтримує MSAL напряму
**Наслідок:** `/api/auth/token` генерує JWT, `useAuthRefresh` оновлює кожні 40хв

### [2] HS256 замість ES256 для JWT
**Рішення:** HMAC-SHA256 з JWT secret (PostgREST `jwt-secret`)
**Відкинуто:** ES256
**Чому:** PostgREST використовує HS256 за замовчуванням
**Наслідок:** `POSTGREST_JWT_SECRET` — ключ з postgrest.conf

### [3] Два PostgREST клієнти by design
**Рішення:** `supabase.ts` (anon, client) + `db-server.ts` (service_role, server)
**Відкинуто:** один клієнт
**Чому:** Client потрібен anon key + custom JWT для RLS. Server потрібен service_role для bypass RLS
**Наслідок:** `getServerDb()` — singleton. НЕ створювати нові клієнти

---

## Бот-платформа

### [4] Bot tools повертають FormattedResult (не raw JSON)
**Рішення:** інструменти повертають ГОТОВИЙ текст
**Відкинуто:** AI-синтез в оркестраторі
**Чому:** кожен tool знає свій домен краще за оркестратор. AI-синтез всередині tool на серверному ключі
**Наслідок:** оркестратор пробрасує as-is. `ANTHROPIC_API_KEY` серверний, не юзерський

### [5] Self-describing bot architecture
**Рішення:** кнопки/меню генеруються автоматично з реєстру tools
**Відкинуто:** хардкод кнопок в кожному каналі
**Чому:** додати новий tool = додати `directCommand` в файл → меню оновиться автоматично
**Наслідок:** `tool-registry.ts`, `getDirectTools()`, `getTeamsSuggestedActions()`

### [6] Direct router — кнопки без AI
**Рішення:** прямі команди (кнопки) виконуються без AI routing
**Відкинуто:** все через AI
**Чому:** AI = +2-5сек + токени. Кнопка "Мій звіт" не потребує AI
**Наслідок:** `direct-router.ts` в кожному каналі, `callback_data = "direct:<tool>"`

### [7] Scope enforcement в коді, не в prompt
**Рішення:** `execute()` перевіряє scope (`own`/`department`/`all`) програмно
**Відкинуто:** AI prompt "не показуй чужі дані"
**Чому:** AI може проігнорувати prompt. Код — надійніший
**Наслідок:** `ToolContext.scope`, перевірка в кожному tool

---

## Knowledge Base

### [8] Hybrid search: vector + BM25 + RRF
**Рішення:** `match_kb_documents` RPC — cosine + ts_rank + Reciprocal Rank Fusion
**Відкинуто:** тільки vector search
**Чому:** vector погано шукає точні збіги (номери наказів, прізвища). BM25 доповнює
**Наслідок:** `SECURITY DEFINER` на RPC, `'simple'` tsvector config для укр/рос

### [9] Contextual retrieval для KB chunks
**Рішення:** embedding з префіксом `"Категорія: X\nДокумент: «Y»\n..."`
**Відкинуто:** plain chunk embedding
**Чому:** контекст покращує пошук на ~20% (Anthropic research)
**Наслідок:** префікс НЕ зберігається в БД, генерується при embed

### [10] KB search — retry з category fallback
**Рішення:** `uk_0.20 → uk_0.10 → uk_0.35_nocat → uk_0.20_nocat`
**Відкинуто:** single-shot search
**Чому:** AI може неправильно класифікувати категорію. `nocat` fallback з вищим порогом запобігає шуму
**Наслідок:** до 4 спроб пошуку, але зазвичай 1-2

---

## Інфраструктура

### [11] Presence і conversation memory — в пам'яті
**Рішення:** in-memory Map, TTL (4хв presence, 10хв memory, 10 pairs)
**Відкинуто:** Supabase realtime, Redis (not available with PostgREST)
**Чому:** single process на Synology. Некритичні дані. Простота
**Наслідок:** втрачаються при рестарті — прийнятно

### [12] Reference data — staleTime: Infinity
**Рішення:** companies, departments, processes, projects кешуються без інвалідації
**Відкинуто:** refetchOnWindowFocus
**Чому:** дані статичні, змінюються раз на рік
**Наслідок:** `useCompanies`, `useEmployees` з `staleTime: Infinity`

### [13] Telegram push — fire-and-forget
**Рішення:** `POST /api/telegram/notify/plan-created` — не чекати відповідь
**Відкинуто:** queue, guaranteed delivery
**Чому:** сповіщення — best effort. Synology не має message queue
**Наслідок:** `try/catch` в UI, логування помилок

---

## Бізнес-логіка

### [14] Task-level company distribution
**Рішення:** компанії прив'язані до `daily_task`, не `monthly_plan`
**Відкинуто:** plan-level companies
**Чому:** різні задачі в одному плані → різні компанії
**Наслідок:** `daily_task_companies`, `distribution_type` per task

### [15] PDF official format — server-side PDFKit
**Рішення:** PDFKit з Cyrillic шрифтами, українська локалізація
**Відкинуто:** client-side PDF, jsPDF
**Чому:** офіційний формат з підписами, печатками, ПДВ. Потрібен точний контроль
**Наслідок:** `pdf-report.service.ts` (893 рядків → потрібне розбиття)

### [16] KPI = actual_hours / planned_hours × 100%
**Рішення:** норма = 70% capacity. Три рівні: employee (місяць), head (квартал), chief (рік)
**Відкинуто:** абсолютні показники
**Чому:** відносний KPI враховує різну завантаженість і work_rate
**Наслідок:** пороги: ≥130% amber, ≥100% green, ≥70% orange, <70% red

---

### [17] 3-системна архітектура: bot-adapter pattern
**Рішення:** кожна система (KB, KPI, Plans, Reports/Activity) має `bot-adapter.ts` — свій опис інтеграції з ботом
**Відкинуто:** центральна папка `lib/bot/tools/` з усіма інструментами
**Чому:** `bot/tools/` порушувала незалежність модулів — щоб додати KB-функцію боту треба було йти в `bot/tools/`. Кожна система сама знає як вона інтегрується з ботом
**Наслідок:**
- `lib/bot/tools/` видалена
- `lib/bot/shared/` — спільні format helpers для всіх адаптерів
- `lib/notifications/` → `lib/bot/notifications/` (нотифікатор — частина Bot системи)
- `registry.ts` імпортує з `domain/bot-adapter.ts`, не з `tools/`
- Додати новий tool = додати `bot-adapter.ts` в свою домену

**Правила (зафіксовано в ARCHITECTURE.md):**
- `bot/core/registry` → `domain/bot-adapter` (через реєстр)
- `domain/bot-adapter` → `bot/shared/` (format helpers)
- `domain/bot-adapter` → `domain/*` (своя бізнес-логіка)
- ❌ `bot/core/` → `domain/*` напряму
- ❌ `domain/` → `bot/core/`
- ❌ `kb/` → `bot/` або `platform/`
- ❌ `platform/` → `kb/`

---

### [18] lib/ → 4-folder architecture (2026-03-02)

**Context:** After grouping ops-specific utils and graph into ops/ (Phase 8), the lib/ root still had 8 scattered infrastructure folders (ai/, api/, auth/, config/, providers/, utils/, logger.ts, supabase*.ts) mixed with the 3 system folders (bot/, kb/, ops/).

**Decision:** Group all cross-cutting infrastructure into `lib/shared/`. Result: lib/ contains exactly 4 folders: bot/, kb/, ops/, shared/. Import paths: `@/lib/auth` → `@/lib/shared/auth`, `@/lib/config` → `@/lib/shared/config`, `@/lib/logger` → `@/lib/shared/logger`, `@/lib/ai` → `@/lib/shared/ai`, `@/lib/api` → `@/lib/shared/api`, `@/lib/providers` → `@/lib/shared/providers`, `@/lib/supabase*` → `@/lib/shared/supabase*`, `@/lib/utils` → `@/lib/shared/utils` (cn) and `@/lib/shared/utils/` (error-message, fetch-with-timeout).

**Rationale:** Visual clarity. The 3-system model (bot/kb/ops) is now immediately obvious from lib/. Infrastructure is grouped, not scattered. `lib/` root structure communicates intent at a glance.

**Consequences:** All `@/lib/auth`, `@/lib/config`, `@/lib/logger`, `@/lib/ai`, `@/lib/api`, `@/lib/providers`, `@/lib/supabase*`, `@/lib/utils` imports updated to `@/lib/shared/...` (done via sed). No logic changes.

---

### [19] components/ → 4-folder structure (2026-03-02)

**Context:** components/ had 9 root-level folders (auth, bots, dashboard, employees, help, infrastructure, navigation, plans, ui) with scattered placement. plans/ was outside dashboard/ while all other content sections (reports, kpi, references) lived inside dashboard/content/. employees/ and infrastructure/ were only used by reference section components.

**Decision:** Consolidate into 4 root folders: auth/, navigation/, ui/, dashboard/. Move all dashboard-specific components inside dashboard/. Move employees/ and infrastructure/ inside references/ (their only consumers). Move bots/ and help/ inside dashboard/ (dashboard-only).

**Rationale:** Mirrors lib/ 4-folder approach (Phase 9). Eliminates inconsistency (plans outside dashboard while reports/kpi inside). Co-location principle: move files near their consumers. Root structure communicates intent at a glance: auth, nav, design system, dashboard.

**Consequences:** components/ root has exactly 4 folders. Import paths updated (no logic changes):
- `@/components/plans/...` → `@/components/dashboard/content/plans/...`
- `@/components/employees/...` → `@/components/dashboard/content/references/employees/...`
- `@/components/infrastructure/...` → `@/components/dashboard/content/references/infrastructure/...`
- `@/components/bots/...` → `@/components/dashboard/bots/...`
- `@/components/help/...` → `@/components/dashboard/help/...`
- `@/components/ActiveUsersList` → `@/components/dashboard/ActiveUsersList`

---

### [20] dashboard/ internal grouping rules (2026-03-02)

**Context:** After Phase 10 all dashboard-specific UI moved into dashboard/. The folder grew to contain ~50 files with no internal structure.

**Decision:** Three rules govern grouping inside dashboard/:
1. Nav section → always a folder (activity/, bot/, kb/, kpi/, plans/, references/, reports/)
2. Three or more related files → folder (header/ for ActiveUsersList+BotSection+HelpContent, shared/ for layout primitives)
3. Shell/layout component → root file (DashboardContent.tsx, DashboardHeader.tsx, sections.tsx)

**Rationale:** Nav-section folders make section boundaries obvious and match mental model. The "3+ files → folder" rule prevents premature nesting while avoiding clutter. Root files remain easily discoverable.

**Consequences:** dashboard/ has clear internal topology. Adding a new nav section = create a folder.

---

### [21] Bot and KB as standalone dashboard sections (2026-03-02)

**Context:** BotSettingsContent.tsx and KB components (KBContent, KBAnalyticsContent) lived inside references/ alongside calendar, companies, etc. They appeared as sub-tabs under "Довідники" nav item.

**Decision:** Promote Bot and KB to standalone top-level nav sections. Move:
- `references/BotSettingsContent.tsx` → `dashboard/bot/BotSettingsContent.tsx`
- `references/KBContent.tsx`, `KBAnalyticsContent.tsx` → `dashboard/kb/`

**Rationale:** KB is an independent system (lib/kb/ is standalone). Bot settings have no relation to business reference data. Their importance warrants first-class navigation position. Nav sections: chief adds "База знань" and "Бот"; head adds "База знань".

**Consequences:** references/ is now purely reference data (calendar, companies, employees, procedures, meetings, projects). Bot and KB have dedicated folders under dashboard/.

---

### [22] references/ internal grouping by nav sub-section (2026-03-02)

**Context:** references/ folder contained 15+ files flat with no internal grouping — calendar components, company components, employee components, procedure components all mixed together.

**Decision:** Group references/ contents into subfolders by sub-section:
- `calendar/` — CalendarReferenceContent + calendar sub-components
- `companies/` — CompaniesReferenceContent + infrastructure/ subfolder
- `employees/` — EmployeesReferenceContent + EmployeeCard + EmployeeDetails
- `procedures/` — ProceduresReferenceContent + EtalonsReferenceContent + ProcedureEtalons
- Flat files: MeetingsContent.tsx, ProjectsReferenceContent.tsx (each is a single file — rule 2 not triggered)

**Rationale:** Applies grouping rule #1 (nav section → folder) consistently within references/. Calendar and companies are complex enough (3+ files each) to warrant folders regardless.

**Consequences:** Clearer co-location. Moving or editing calendar logic no longer requires scanning 15+ mixed files. Import paths: `references/CalendarReferenceContent` → `references/calendar/CalendarReferenceContent`.

---

### [23] weekly digest scheduling via pm2 cron (2026-03-03)

**Context:** Нужна проактивная еженедельная рассылка дайджеста всем пользователям. Варианты: instrumentation.ts + node-schedule (внутри Next.js), отдельный pm2 процесс, pg_cron (or separate pm2 process).

**Decision:** Отдельный pm2 процесс `digest-cron` с `--cron "0 9 * * 1" --no-autorestart`. Скрипт `scripts/digest-cron.mjs` читает `.env.local` сам и вызывает `POST /api/digest/weekly` через HTTP.

**Rationale:** Нет новых npm зависимостей, не трогает Next.js server process, прозрачно виден в `pm2 list`. Скрипт завершается после выполнения (stateless). HTTP вызов изолирует сбой cron от основного сервера.

**Consequences:** На NAS работают 2 pm2 процесса: `reportib` и `digest-cron`. При деплое `digest-cron` не затрагивается. Middleware: `/api/digest/weekly` в `publicPaths`, авторизация — заголовок `x-cron-secret`.

---

### [24] Weekly planner: auto-suggest + batch create (2026-03-09)

**Context:** Тижневий планер потребує автоматичного розподілу процедур. Два сценарії: є минулий тиждень (повторити), немає (розрахувати пропорційно). Кнопка «Прийняти всі» спочатку створювала N окремих POST-запитів → Too Many Requests (rate limit 60/min).

**Decision:** Два алгоритми suggest в `lib/ops/planner/weekly-suggest-strategies.ts`:
1. `suggestFromPreviousWeek` — копіює розклад минулого тижня з бюджетом залишку (prev minutes − already scheduled).
2. `suggestProportional` — `planned_hours ÷ assignees ÷ 4` = тижневий бюджет, weight-based розподіл по днях.

Batch create: POST `/api/planner/entries` з `{ entries: [...] }` → batch insert `weekly_calendar_entries`. Хук `usePlanner` з optimistic update.

**Rationale:** Budget-based підхід замість boolean skip — процедура з 8 год/тиждень не пропускається якщо 2 год вже заплановано, а отримує 6 год. Batch INSERT — 1 запит замість N, жоден rate limit не зачіпається. Ghost-блоки (dashed border) з ✓/✗ — користувач бачить і контролює кожен слот перед прийняттям.

**Consequences:** maxAttempts=50 (10× днів), fallback 30 хв якщо 60 не вміщується. Suggest endpoint read-only (GET), batch create endpoint пропускає overlap checks — caller гарантує відсутність конфліктів (suggest уже перевіряє). DragOverlay рендерить плитку-клон оригінального блоку з правильними кольорами та висотою.

---

### [25] Шаблони задач + розширення daily_tasks (2026-03-16)

**Context:** Аналіз daily_tasks показав ~40 описів задач, що повторюються щомісяця для кожної процедури (напр. "Розгляд та погодження доступів до ІС" — 46 разів, 4 користувачі). Співробітники щоразу пишуть опис вручну. Крім того, daily_tasks не має короткої назви (title) та не відстежує походження задачі.

**Decision:**

1. **Нова таблиця `procedure_task_templates`** — довідник шаблонів задач процедури:
```
procedure_task_templates (
  id            uuid PK DEFAULT gen_random_uuid(),
  procedure_id  uuid FK → procedures NOT NULL,
  title         text NOT NULL,        -- коротка назва (бачить співробітник)
  content       text NOT NULL,        -- опис задачі (підставляється в description + використовується AI)
  is_active     boolean DEFAULT true,
  created_by    uuid FK → user_profiles NULL,  -- NULL = системний
  created_at    timestamptz DEFAULT now()
)
```

2. **Розширення `daily_tasks`** — 3 нові колонки:
```
ALTER TABLE daily_tasks ADD COLUMN title text;
ALTER TABLE daily_tasks ADD COLUMN source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'template', 'manager', 'calendar', 'chief', 'head'));
ALTER TABLE daily_tasks ADD COLUMN created_by uuid REFERENCES user_profiles(user_id);
ALTER TABLE daily_tasks ADD COLUMN task_type text NOT NULL DEFAULT 'incomplete'
  CHECK (task_type IN ('draft', 'incomplete', 'completed'));
```

- `title` — коротка назва задачі (з шаблону або вручну)
- `source` — походження: manual (сам), template (з шаблону), chief (від шефа), head (від керівника), manager (загальне), calendar (Outlook)
- `created_by` — UUID користувача який створив задачу (для аудиту)
- `task_type` — стан: draft (чернетка), incomplete (незавершена), completed (виконана)

3. **Таблиця `ai_reference_examples` — не змінюється.** Еталони AI живуть окремо від шаблонів задач.

**Флоу співробітника:**
1. Відкриває план → бачить задачі (title + години)
2. "Додати" → "Із шаблону" або "Своя задача"
3. Із шаблону: список title з `procedure_task_templates` → "Взяти" → форма з title (readonly) + description (предзаповнено з content, можна редагувати) + дата + години. `source = 'template'`
4. Своя задача: title + description + дата + години. `source = 'manual'`
5. Задача від керівника: `source = 'manager'`, title заповнений
6. Завершує → `task_type = 'completed'`, `completed_at = now()`

**Флоу керівника:**
1. Довідник процедур → секція "Шаблони завдань" (між Часи і Еталони AI)
2. CRUD шаблонів: title + content (обов'язково)
3. В задачах співробітника → + → створює задачу з `source = 'chief'` або `source = 'head'` (бейдж CHIEF/HEAD)

**Аналітика:** `SELECT source, count(*) FROM daily_tasks GROUP BY source`

**Відкинуто:**
- template_id FK в daily_tasks → зайва зв'язка, шаблон лише підставляє текст
- task_type як обчислюване поле (monthly_plan_id IS NULL і т.д.) → складно запам'ятати комбінації, явний enum простіше
- Розширення ai_reference_examples замість нової таблиці → різна семантика, різні споживачі

**Тех. борг:** видалити `service_prompt` з measures + view + RPC + код (порожній у всіх процедур).

**Consequences:** 1 нова таблиця, 3 нові колонки в daily_tasks. UI: секція шаблонів в довіднику процедур + вибір шаблону при створенні задачі. Наповнення: ~40 системних шаблонів з аналізу реальних даних.

### [26] Accept/Reject flow для задач від керівництва (2026-03-16)

**Context:** ADR [25] додав `source = 'chief'|'head'` і `task_type`, але не визначив як саме керівник підтверджує виконання задач. Потрібен explicit workflow прийняття/відхилення.

**Decision:**

1. **Completion rules по source:**
   - `manual`/`template`: completed коли hours > 0 AND description заповнено
   - `chief`/`head`: completed **тільки** коли прийнято керівником (accept → `task_type = 'completed'`)
   - `calendar`: auto-completed на основі годин

2. **Accept/Reject UI в PlanWorkLog:**
   - Chief/Head бачать ✓ (accept) і ✗ (reject) на задачах які вони призначили
   - Accept → `task_type = 'completed'`, `completed_at = now()`
   - Reject → `task_type = 'draft'` (повернення на доопрацювання)
   - Chief може accept/reject задачі з source `chief` і `head`
   - Head може accept/reject тільки задачі з source `head`

3. **Бейджі:** CHIEF (purple) / HEAD (teal) на задачах в PlanWorkLog

**Файли:** `useMonthlyPlanHandlers.ts` (handleAcceptTask/handleRejectTask), `PlanWorkLog.tsx` (UI кнопки + бейджі), `MonthlyPlanDetails.tsx` (props wiring), `AddTaskModal.tsx` (creatorRole → auto source)

**Відкинуто:**
- Окремий статус 'pending_review' → зайва складність, draft достатньо для повернення
- Notification при accept/reject → поки без, додати пізніше якщо потрібно

**Consequences:** Керівник контролює якість задач. Співробітник бачить бейдж і не може сам завершити задачу від керівника.

---

## Відкриті питання

| Питання | Коментар |
|---------|---------|
| ES256 BYOK | N/A — PostgREST uses HS256 natively |
| WhatsApp канал | Архітектура bot/core готова, потрібен Business API |
| Distributed cache | Якщо буде >1 process — перехід на Redis |
| ✅ `process.env` централізація | Виконано: `lib/shared/config/index.ts` (Phase 2+9) |
| ✅ God objects розбиття | Виконано: всі файли ≤400 рядків (Phase 4) |
| ✅ **Великий Календар → Планувальник** | Реалізовано і витягнуто в `lib/ops/planner/`: `calendar-entries.ts` (CRUD), `calendar-sync.ts` (delta PULL), `calendar-push.ts` (batch PUSH), `calendar-shared.ts` (shared utils). ADR [24], [27]. |
| ✅ **Auto-distribute** | Реалізовано: `lib/ops/planner/weekly-suggest-strategies.ts`, 2 стратегії, batch accept-all. ADR [24]. |
| ✅ **Шаблони задач** | Реалізовано: `procedure_task_templates` + розширення `daily_tasks` (title, source, task_type). ADR [25]. Accept/reject flow — ADR [26]. |
| ✅ **Планувальник (Planner)** | Модуль витягнуто з Кабінету: `lib/ops/planner/` (15 сервісів), `app/api/planner/` (15 routes), `components/dashboard/planner/` (15 компонентів), 5 хуків, route `/dashboard/planner`. ADR [27]. |
| **Тех. борг: service_prompt** | Видалити `service_prompt` з measures + view `v_kpi_operational` + RPC `manage_measure` + код. Порожній у всіх процедур. |

---

### [27] Планувальник — витяг модуля з Кабінету (2026-03-18)

**Контекст:** Модуль Кабінет перетворився на комбайн: статистика, відпустки, профіль, бот-налаштування, тижневий календар, задачі, чернетки, шаблони, Outlook sync, meeting info/summary. Робота з задачами розмазана по 4 модулях (Плани, Кабінет, Бот, task-service). Немає єдиного CRUD-сервісу для задач.

**Рішення:** Витягнути «Планувальник» в окремий модуль з окремою вкладкою в навігації.

- `lib/ops/planner/` — 15 сервісів (calendar-entries, calendar-sync, calendar-push, drafts, task-service, task-templates, meeting-details, meeting-summary, weekly-suggest)
- `app/api/planner/` — 15 API routes (entries, tasks, drafts, templates, meetings, sync)
- `components/dashboard/planner/` — 15 компонентів (PlannerContent, Grid, Blocks, Sidebar, Toolbar, Stats, TasksPanel, AddTaskModal)
- `hooks/` — 5 хуків (usePlanner, usePlannerSync, usePlannerTasks, usePlannerDrafts, useTaskTemplates)
- Route: `/dashboard/planner`

**Стратегія міграції:** Старі файли замінені на re-export шими (не видалені). Plans, Bot, старі API routes продовжують працювати. Phase 7 (cleanup шимів) — окрема задача після тестування.

**Причина:** Єдиний модуль для планування робочого тижня. Чіткіші межі. Кабінет стає легким (профіль + відпустки). Планувальник може розвиватися незалежно.

**Дизайн:** `docs/plans/2026-03-18-planner-module-design.md` (v2)

### [28] Календар і задачі — незалежні сутності (2026-03-19)

**Контекст:** При прив'язці daily_task до calendar entry блок у календарі змінював колір (completed/draft-task/draft). Еврістика `taskCompleted` хибно визначала задачу як завершену якщо опис був довший за назву процедури.

**Рішення:** Розв'язати візуальний статус календаря від задач.

- `entryStatus()` більше не перевіряє `daily_task_id` / `task_completed` — календар показує лише план/sync статуси (distributed / synced / returned / external)
- Еврістику `taskCompleted` замінено на точну перевірку `!!completed_at`
- Задачі створюються тільки при явному "зборі" (collect) — це окрема дія користувача

**Причина:** Календар = планування робочого часу. Задачі = звітність по виконаній роботі. Це різні контексти, які не повинні змішуватися візуально.

**Також в цьому релізі (2026-03-19):**
- `TasksModal` — єдина модалка для створення/редагування задач: шаблони (dropdown), компанії (toggleable chips з плану), проекти, документи ІБ, вкладення
- `PlannerTasksDetail` — confirm delete (🗑→✓+✗), кнопка редагування, CSS-класи статусів (.done/.draft/.approval/.rejected), опис плану на amber фоні
- API `planner/tasks` розширено: planInfo повертає companyIds, planProjects, planDocuments; tasks повертають project_id, document_number
- API `planner/entries` PATCH — виправлено: daily_task_id тепер передається в updateEntry
- DnD snapCenter modifier виправлено для коректного позиціонування overlay
- Мобільна версія — виправлено порожній календар на вузьких екранах

---

## [28] Planner Calendar Flow v3 — needs_push + template-based collect (2026-03-20)

**Контекст:** Calendar module мав змішану відповідальність — знав про daily_tasks, статуси задач, створював задачі при виборі шаблону. Push видаляв і створював нові events замість оновлення. Не було способу відрізнити "змінено у нас" від "змінено в Outlook".

**Рішення:**
- Нова колонка `needs_push` (boolean) — відстежує локальні зміни що потребують Push
- `outlook_event_id` ніколи не скидається при локальних змінах — Push робить PATCH існуючого event
- 7 статусів плиток з чітким пріоритетом: collected → returned → templated → modified → synced → external → distributed
- Вибір шаблону (TaskPickerDropdown) записує `task_template_id` на entry, НЕ створює daily_task
- Collect (ClipboardCheck) групує entries по `task_template_id`, створює daily_tasks без модалки
- При drag/resize entry з `outlook_event_id` → `needs_push = true`, `outlook_modified = false`
- Pull з Outlook: видалені events → очищення `outlook_event_id`; змінені → `outlook_modified = true` з перезаписом даних

**Причина:** Чітке розділення: календар = планування часу, задачі = результат планування. Push/Pull = двосторонній sync без дублікатів.

**Дизайн-документ:** `docs/plans/2026-03-20-planner-calendar-flow.md`

## [29] Calendar bugfixes + external events collect (2026-03-20)

**Контекст:** Тестування календаря виявило 6 багів у sync + потребу збирати зовнішні події (наради з Outlook) в задачі.

**Рішення (bugfixes):**
- **PUSH:** додано PATCH $batch для `needs_push` записів (раніше тільки POST для нових)
- **PULL returned:** `outlook_modified` скидається перед reconcile, не після — щоб прапорець ставився лише для реально змінених
- **PULL deleted:** delta-mode обробляє `@removed` для plan entries (unlink `outlook_event_id`)
- **Copy week:** прибрано обов'язковий `monthly_plan_id`, копіює `task_template_id`
- **Lunch:** кнопка обіду завжди активна (прибрано блокування при наявності plan entries)
- **Cascade:** `skipOverlapCheck` параметр для create/update, frontend передає `cascade: true`
- **Subject mismatch:** reconcile ігнорує зміну subject якщо локальний `null` (push ставить procedure name)

**Рішення (external events → tasks):**
- Drop процедури з sidebar на зовнішню подію → прив'язує `monthly_plan_id`
- Badge шаблонів на всіх плитках (plan + external) без `daily_task_id`
- Picker: плитка без плану → список процедур → "Тільки процедуру" або шаблон
- Collect обробляє external з транскриптом: `subject` → title, `transcript_summary` → description
- Послідовне видалення на external: корзина знімає шаблон → процедуру

**Файли:** `calendar-push.ts` (split → +helpers), `calendar-sync.ts`, `calendar-sync-reconcile.ts`, `calendar-entries-write.ts`, `collect-tasks.ts`, `PlannerBlocks.tsx`, `PlannerGrid.tsx`, `PlannerContent.tsx`, `PlannerHeader.tsx`, `PlannerSidebar.tsx`, `TaskPickerDropdown.tsx`, `usePlanner.ts`

---

## [30] Fix task source badge — chief/head creating tasks for themselves (2026-03-23)

**Контекст:** Коли chief або head створював задачу **собі** в своєму місячному плані, поле `source` ставилось як `'chief'`/`'head'` → з'являвся бейдж "CHIEF"/"HEAD" → виглядало як задача від керівника. Насправді бейдж має з'являтися лише коли керівник створює задачу **іншому** співробітнику.

**Рішення:** В `MonthlyPlanDetails.tsx` передаємо `creatorRole` в `AddTaskModal` тільки коли `taskTargetUserId !== user.user_id` (тобто задача створюється іншому користувачу). Якщо створюєш собі → `creatorRole = undefined` → `source = 'manual'`.

**Файли:** `MonthlyPlanDetails.tsx:281`, `AddTaskModal.tsx` (comment update)

---

## Інфраструктура

### Міграція Synology → Hetzner VPS (2026-03-23)

**Контекст:** Проект працював на Synology DS920+ в локальній мережі. MikroTik роутер забезпечував доступ ззовні через NAT/port forwarding (порт 3000 для web, 8443 для Telegram webhook). Потрібен стабільний хостинг з прямим доступом з інтернету.

**Рішення:** Повна міграція на Hetzner Cloud VPS (CAX11, ARM aarch64, Ubuntu 24.04). Порт змінено з 3000 на 443 (стандартний HTTPS). URL: `https://maxtitan.me` (без `:3000`).

**Причина:** Hetzner блокує нестандартні порти (3000) на рівні мережевої інфраструктури — пакети не доходять до eth0. Стандартний порт 443 працює без обмежень. Додатково: чистіший URL, не потрібен MikroTik port forwarding, Telegram webhook на стандартному порту.

**Що змінено:**
- `server.js` — порт 443, CORS origin без `:3000`
- `src/lib/shared/auth/config.ts` — `APP_BASE_URL` без `:3000`
- `.env`, `.env.local` — `NEXT_PUBLIC_BASE_URL=https://maxtitan.me`
- `deploy.sh` — target: `root@91.99.156.163:/opt/cs-platform/`, PORT=443
- `scripts/digest-cron.mjs` — fallback URL на порт 443
- Azure AD redirect URI — оновлено на `https://maxtitan.me`
- Telegram webhook — перереєстровано на 443 з явним `ip_address: 91.99.156.163`
- Teams Bot messaging endpoint — оновлено
- Hetzner Cloud Firewall — inbound: ICMP + TCP 22/443/3000, outbound: TCP/UDP any

**Важливо:**
- `digest-cron` запускати ТІЛЬКИ з `--no-autorestart` (інакше нескінченний цикл рестартів = спам дайджестами)
- НЕ додавати NAT redirect правила в iptables (443→3000) — це ламає вихідний трафік
- GRE тунель `gre-mt` до MikroTik (10.77.0.0/24) — для VPN доступу з LAN

---

*Березень 2026 — формалізація існуючих рішень*

---

### [18] KB Laws — мікросервіс law-fetcher + UI модуль "Законодавство" (2026-03-25)

**Контекст:** Потрібно імпортувати законодавство України (закони, постанови КМУ, накази) в RAG для юридичних консультацій бота. Документи на zakon.rada.gov.ua завантажуються JS-рендерингом.

**Рішення:** Окремий мікросервіс `law-fetcher` (Express + Playwright) на DB VPS, порт 3100. App VPS проксирует через `lib/ops/laws/fetcher-client.ts`. UI вкладка "Законодавство" в KB.

**Причина:**
- Playwright потребує Chromium (~400MB RAM) — не навантажувати App VPS (прод)
- DB VPS вже має Node.js, PM2, вільні ресурси
- Черга запитів (один Playwright за раз) — контроль RAM
- Пошук за URL/номером (не текстовий — zakon.rada.gov.ua не дає релевантних результатів)
- Зв'язки через вкладку "Зв'язки" на zakon.rada.gov.ua (парсинг)
- Contextual prefix — skip на rate limit (Anthropic Tier 1: 50K tokens/min)

**Наслідки:**
- `LAW_FETCHER_URL` + `LAW_FETCHER_KEY` в .env.local на обох серверах
- law-fetcher в PM2 на DB VPS (порт 3100, внутрішня мережа 10.0.0.x)
- Документи зберігаються в kb_documents з metadata: doc_type, doc_number, source_url, related_docs, fetched_at
- Шапка з метаданними в markdown — чанкер зберігає зв'язки для RAG

---

### [31] Security headers + блокировка прямого PostgREST (2026-03-31)

**Контекст:** PostgREST був доступний напряму через `/rest/v1` proxy в `server.js`. Debug endpoints (`/api/debug/graph-test`, `/api/debug/memory`) та `/env-check` page залишались у проді.

**Рішення:**
- Security headers в `next.config.js`: X-Frame-Options (DENY), X-Content-Type-Options (nosniff), HSTS (1 рік), CSP-Report-Only, Permissions-Policy
- Cache-Control `private, no-store` для динамічних сторінок (запобігає кешуванню CDN/proxy)
- Прямий `/rest/v1` доступ повертає 404 — весь трафік через `/api/db/[...path]` (authenticated proxy)
- Видалено: `/api/debug/graph-test`, `/api/debug/memory`, `/env-check` page

**Причина:** Захист від clickjacking, MIME sniffing. Прямий PostgREST bypass обходив auth — тепер заблоковано. Debug endpoints — зайві attack surface в проді.

**Наслідок:** `server.js` тепер тільки проксирує n8n. Вся взаємодія з БД — через authenticated API routes.

---

### [32] KB Laws — файловий імпорт + child documents + completeness (2026-03-31)

**Контекст:** Імпорт законів вимагав URL zakon.rada.gov.ua. Деякі підзаконні акти недоступні на сайті або потребують ручного завантаження. Не було способу перевірити чи всі зв'язані документи є в KB.

**Рішення:**
- `url` в import API став optional, додано `fileContent` + `fileName` — імпорт з файлу (.md, .docx)
- Parent-child зв'язки: `parent_doc_id` → ланцюг батьків → header "На виконання: ..."
- `/api/kb/laws/completeness` POST — порівнює зв'язані URL з source_url в KB, повертає `{ total, present, missing[] }`
- UI: кнопка FilePlus (додати дочірній), Search (перевірити повноту), `LawChildUploadModal` для файлового завантаження
- `lib/kb/search-locators.ts` — мета-запит (список документів по категорії) + legal locator (пошук по номеру статті)
- `fetcher-client.ts` — `extractDocNumber()` парсить номер з URL

**Причина:** Не всі документи є на zakon.rada.gov.ua. Child documents потребують parent context для RAG. Completeness checker — швидка перевірка прогалин.

**Наслідок:** Новий API route `/api/kb/laws/completeness` (rate limit 10/min). Дерево бібліотеки коректно рендерить parent-child ієрархію.

---

### [33] Plan status rename: completed → done (2026-03-31)

**Контекст:** Статус плану `'completed'` використовувався у ~15 файлах. Потрібна стандартизація.

**Рішення:** Перейменування `'completed'` → `'done'` у всіх SQL-запитах, фільтрах, UI-маппінгах, бот-адаптерах, звітах. Display text ("Виконано"/"Выполнено") не змінено.

**Файли:** `planning-utils.ts`, `bot-adapter.ts`, `cabinet/stats.ts`, `kpi/service.ts`, `calendar-entries.ts`, `reports/service.ts`, `reports/excel-data.ts`, `reports/quarterly-*.ts`, `month-summary/route.ts`, `types/planning.ts`

**Причина:** Консистентність з коротшим enum. `'done'` відповідає конвенціям.

**Наслідок:** БД значення в `monthly_plans.status` має бути `'done'`. UI текст не змінився.

---

### [34] Plans V2 — фільтрація по департаменту + алфавітне сортування (2026-03-31)

**Контекст:** Всі користувачі бачили всі процеси незалежно від ролі. Процедури та виконавці відображались у довільному порядку.

**Рішення:**
- Не-chief бачать тільки процеси свого `department_id`
- Процедури: `.sort((a,b) => a.name.localeCompare(b.name, 'uk'))`
- Процеси: сортування за назвою (замість planned hours)
- Виконавці: алфавітне сортування

**Причина:** Релевантність даних для кожної ролі. Алфавітний порядок — передбачуваний і зручний.

**Наслідок:** `usePlansV2.ts` використовує `user.role` та `user.department_id` для фільтрації. `usePlansV2Detail.ts` сортує assignees.

---

### [35] Planner — native HTML5 drag замість @dnd-kit (2026-03-31)

**Контекст:** Planner використовував `@dnd-kit` для drag-and-drop блоків календаря. Бібліотека додавала складність (useDraggable hooks, listeners, attributes).

**Рішення:** Замінити на нативний HTML5 drag API: `draggable`, `onDragStart`, `e.dataTransfer.setData('application/planner-slot', JSON.stringify({ id }))`.

**Причина:** Спрощення коду, зменшення залежностей. Нативний API достатній для поточного use case.

**Наслідок:** Прибрано залежність від `@dnd-kit`. Логіка canDrag збережена.


# ===== FILE: DEVELOPER_GUIDE.md =====

﻿# Руководство разработчика CS Platform

> Последнее обновление: 2026-03-03

## Модель работы приложения

- Основная точка входа: `/` (`src/app/page.tsx`).
- Разделы дашборда переключаются внутри одной страницы:
  - `/` — активность
  - `/plans` — планы
  - `/reports` — отчеты
  - `/kpi` — KPI
  - `/references` — справочники
- Совместимые маршруты в `src/app/dashboard/*` и верхнеуровневые страницы
  реализованы как редиректы на `/`.

## Технологический стек

- Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- Supabase (PostgreSQL + представления (view) + RPC)
- Интеграция Microsoft 365 / Azure AD
- Playwright для E2E

## Критические правила

1. Идентификаторы пользователей
- В бизнес-логике использовать только Supabase `user_id`.
- Не использовать Azure AD id как доменный id.

2. Доступ к данным
- Для чтения предпочитать представления (view).
- Для записи использовать сервисный/модульный слой:
  `src/lib/ops/plans/*`, `src/lib/ops/reports/*`.

3. Навигация дашборда
- Переключение разделов выполняется внутри единой оболочки приложения.
- Не создавать новые изолированные экраны вида `/dashboard/<section>`.

4. Устаревшая weekly-модель
- Weekly-модель БД удалена.
- Не использовать и не возвращать weekly-таблицы/представления/функции.

---

## Работа с базой данных — паттерны

### Архитектура доступа к данным

В проекте два контекста работы с Supabase:

| Контекст | Клиент | RLS | Где используется |
|----------|--------|-----|------------------|
| **Клиент (браузер)** | `supabase` из `@/lib/shared/supabase` | Да, custom JWT (HS256) | Хуки, компоненты |
| **API routes (сервер)** | `getDb()` из `@/lib/shared/supabase-server` — service-role singleton | Обходит RLS | `/api/*` routes |

### 1. Клиент (хуки/компоненты) — TanStack Query

Все клиентские запросы идут через **TanStack Query** с кешированием.
Провайдер: `src/app/QueryProvider.tsx`.

#### Справочники (staleTime: Infinity)

Справочники загружаются **один раз за сессию** и не перезапрашиваются при навигации.

**Файл:** `src/lib/ops/reference-queries.ts`

| Query key | Источник | ~Строк | Описание |
|-----------|----------|--------|----------|
| `['companies']` | `getCompanies()` | 8 | Предприятия |
| `['departments']` | `departments` table | 4 | Отделы |
| `['processes']` | `processes` table | 13 | Процессы |
| `['employees']` | `v_user_details` view | 21 | Сотрудники |
| `['projects']` | `v_projects_with_departments` | 47 | Проекты |
| `['procedures']` | `v_kpi_operational` | 96 | Процедуры (KPI) |

**Как использовать:**
```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companiesQueryOptions } from '@/lib/ops/reference-queries';

// Чтение из кеша (0 запросов при повторном рендере)
const { data: companies = [], isLoading } = useQuery(companiesQueryOptions);

// Инвалидация после мутации
const queryClient = useQueryClient();
await queryClient.invalidateQueries({ queryKey: ['companies'] });

// Оптимистичное обновление (без повторного запроса к БД)
queryClient.setQueryData<Company[]>(['companies'], (prev) =>
  prev ? prev.filter(c => c.company_id !== deletedId) : []
);

// Доступ к кешу из другого хука (из кеша или 1 запрос если пусто)
const procedures = await queryClient.ensureQueryData(proceduresQueryOptions);
```

#### Данные с TTL (staleTime < Infinity)

Для данных, которые меняются чаще (активности, задачи):
```tsx
const { data } = useQuery({
  queryKey: ['activity-feed', userId, period],
  queryFn: async () => { /* ... */ },
  staleTime: 2 * 60 * 1000,  // 2 минуты
  refetchOnMount: true,        // перезапрос если stale
});
```

#### Планы — оптимизация через view

Часы и количество задач для месячных планов берутся из view `v_monthly_plan_hours`
(агрегация ~21K строк daily_tasks → ~120 строк).

```tsx
// ❌ НЕЛЬЗЯ: прямой запрос к daily_tasks для агрегации часов
const { data } = await supabase.from('daily_tasks').select('spent_hours')...

// ✅ ПРАВИЛЬНО: через view
const { data } = await supabase
  .from('v_monthly_plan_hours')
  .select('monthly_plan_id, total_spent_hours, tasks_count')
  .in('monthly_plan_id', planIds);
```

**Исключение:** если нужны per-task данные (user_id, task_date для pivot-таблиц) —
допустимо обращаться к `daily_tasks` напрямую (пример: `summary/route.ts`, task CRUD).

### 2. API Routes (сервер) — service-role

```ts
import { isRequestAuthorized, getDbUserId } from '@/lib/shared/api/request-guards';

// 1. Проверка авторизации
if (!isRequestAuthorized(req)) return 401;

// 2. User ID из httpOnly cookie (НЕ из JWT — это Azure OID!)
const userId = getDbUserId(req);

// 3. Service-role клиент (обходит RLS)
const db = getDb(); // lazy singleton

// 4. Запросы с привязкой к пользователю
const { data } = await db.from('table').select('*').eq('user_id', userId);
```

**Важно:**
- `getDbUserId(req)` → DB user_id из cookie `x-user-id` (правильный)
- `getUserIdFromToken()` → Azure AD OID (**НЕ использовать для запросов к БД**)
- Клиентский `supabase` из `@/lib/shared/supabase` на сервере **не имеет сессии** → RLS блокирует
- Если body/query передаёт userId — сверить с cookie, иначе 403
- Референс: `src/lib/shared/api/request-guards.ts`, `src/app/api/plans/count/route.ts`

### 3. Модули планов (бизнес-логика)

Файлы: `src/lib/ops/plans/service-core.ts`, `plan-factories.ts`, `monthly-mappers.ts`, `quarterly-mappers.ts`

- Используют клиентский `supabase` (с RLS, от имени пользователя)
- Часы из `v_monthly_plan_hours` view (не daily_tasks)
- Маппинг: `src/lib/ops/plans/monthly-mappers.ts`

### 4. Глобальные настройки QueryProvider

Файл: `src/app/QueryProvider.tsx`

- `staleTime: Infinity` — справочники "вечно свежие"
- `refetchOnWindowFocus: false` — без рефетча при фокусе
- `refetchOnMount: false` — без рефетча при монтировании
- `retry: 1` (кроме 401/PGRST301 — без ретрая)

Хуки с другим TTL переопределяют `staleTime` и `refetchOnMount` локально.

### Шпаргалка

| Задача | Решение |
|--------|---------|
| Прочитать справочник | `useQuery(xxxQueryOptions)` |
| Мутация + обновление | `supabase.from().update()` → `invalidateQueries()` |
| Оптимистичное удаление | `queryClient.setQueryData<Type[]>()` |
| Часы по планам (агрегат) | `v_monthly_plan_hours` view |
| Per-task данные | `daily_tasks` напрямую (summary, CRUD) |
| API route запрос | `getDb()` (service-role) + `getDbUserId(req)` |
| Кеш из другого хука | `queryClient.ensureQueryData(queryOptions)` |

---

## KPI — формулы и расчёт

### Основная формула

```
KPI = (факт_часы / план_часы) × 100%
```

### Норма и ёмкость

- **Ёмкость сотрудника** (100%) = рабочие дни (Пн-Пт) × 8 часов − пропорциональный отпуск
- **Норма** (70%) = ёмкость × `KPI_NORM / 100` — реалистичный план (сколько ожидается залогировать)
- **План в monthly_plans** = норма. Плановые часы в планах уже представляют 70% ёмкости
- **Отпуск:** 24 календарных дня/год → ~17.14 рабочих дней/год, пропорционально периоду

### Расчёт ёмкости за период

```typescript
// Рабочие дни: только Пн-Пт, без праздников
// Текущий месяц: считаем только до сегодняшнего дня (не весь месяц)
// Прошлые месяцы: полные
// Будущие месяцы: исключены (availableMonths фильтрует m <= currentMonth)

fullCapacity = getAvailableHours(year, availableMonths)
// Внутри: (рабочие_дни − отпуск_пропорционально) × 8

employeeNormHours = fullCapacity × 70%    // для плана сотрудника, KPI знаменатель
employeeCapacityHours = fullCapacity × 100% // для bench отдела
```

### Пример (12 февраля 2026)

| | Январь | Февраль (до 12-го) | Итого |
|--|--------|---------------------|-------|
| Рабочие дни | 22 | 9 | 31 |
| Отпуск (пропорц.) | — | — | ~2.0 |
| Чистые дни | — | — | ~29.0 |
| Ёмкость (×8ч) | — | — | ~232ч |
| **Норма (×70%)** | — | — | **~162ч** |

### Пороги KPI (design-system.ts: `getKPIStatus`)

| Статус | Условие (KPI%) | Цвет | Значение |
|--------|----------------|------|----------|
| `exceeds` | ≥130% | Amber `#f59e0b` | Перевиконання — повод для анализа |
| `good` | ≥100% | Green `#10b981` | Норма выполнена |
| `warning` | ≥70% | Orange `#fb923c` | Нижче норми |
| `critical` | <70% | Red `#ef4444` | Критично |

### Три уровня KPI

| Уровень | Роль | Период | План (знаменатель) | Факт (числитель) |
|---------|------|--------|---------------------|-------------------|
| Процесний | `employee` | Місяць | `employeeNormHours` (calendar × 70%) | Часы из задач сотрудника |
| Операційний | `head` | Квартал | Сумма `planned_hours` из планов отдела | Сумма часов задач отдела |
| Стратегічний | `chief` | Рік | Сумма `planned_hours` всех планов | Сумма часов всех задач |

### Bench (нормо-ёмкость)

```
bench = кол-во_уникальных_сотрудников × employeeNormHours (70%)
```

Bench показывает сколько нормо-часов дают сотрудники отдела/процесса.
Рассчитывается и для `byDepartment`, и для `byProcess`.
Сравнение plan vs bench показывает загруженность: plan ≈ bench = полная утилизация.

### Ключевые файлы

- API: `src/app/api/kpi/route.ts`
- Hook: `src/hooks/useKPI.ts`
- Оркестратор: `src/components/dashboard/kpi/KPIContent.tsx`
- Views по ролям: `src/components/dashboard/kpi/ProcessKPIView.tsx`, `OperationalKPIView.tsx`, `StrategicKPIView.tsx`
- Shared: `src/components/dashboard/kpi/KPIGauge.tsx`, `KPIProgressBar.tsx`, `KPIStatusBadge.tsx`, `ProcessEfficiencyChart.tsx`
- Пороги/цвета: `src/styles/design-system.ts` → `kpi.getKPIStatus()`, `kpi.getColor()`

---

## Ключевые участки кода

- Оболочка приложения: `src/app/page.tsx`
- Маппинг разделов: `src/components/dashboard/sections.tsx`
- Верхняя навигация: `src/components/navigation/HorizontalNav.tsx`
- UI планов: `src/components/dashboard/plans/PlansContent.tsx`
- Авторизация: `src/lib/shared/auth/index.ts`, `src/lib/shared/auth/config.ts`
- Middleware: `src/middleware.ts`
- Доменные модули планов: `src/lib/ops/plans/service-core.ts`, `plan-factories.ts`, `monthly-mappers.ts`
- Отчеты: `src/lib/ops/reports/` (company-report.ts, employee-report.ts, pdf-*.ts)
- Задачи и файлы:
  `src/components/dashboard/plans/Tasks/TaskFileUpload.tsx`,
  `src/app/api/files/extract-text/route.ts`,
  `src/lib/ops/document-number.ts`

## Задачи и вложения

### Загрузка файлов
- Компонент: `src/components/dashboard/plans/Tasks/TaskFileUpload.tsx`
- Загрузка в SharePoint: `src/lib/ops/graph/sharepoint-service.ts`
- Допустимые форматы: `.docx`, `.doc`, `.pdf`, `.xlsx`, `.xls`, `.txt`

### Извлечение текста для AI-ассистента
- **`.docx`** — клиентский парсинг (JSZip → `word/document.xml`)
- **`.doc`** — серверный API `/api/files/extract-text` (`word-extractor`)
- Извлечённый текст передаётся AI-ассистенту (`/api/ai/task-assistant`)
- Автоматическое извлечение номера СЗ: `src/lib/ops/document-number.ts`

### AI-ассистент задач
- API: `src/app/api/ai/task-assistant/route.ts`
- Текст документа обрезается до 3000 символов перед отправкой в AI

### AI-еталони (RAG)

Система еталонних описів для підвищення якості описів задач і AI-приміток звітів.

**Таблиця:** `ai_reference_examples` (pgvector, HNSW index)
- `content` — еталонний текст
- `category` — `task_description` (описи задач) або `company_report_note` (примітки звітів)
- `procedure_id` — прив'язка до процедури
- `embedding` — vector(1536) від OpenAI text-embedding-3-small
- `source` — `manual` (ручне) або `approved_report` (зі звіту)
- `approved_by` — хто створив (chief/head)

**API:** `src/app/api/ai/embeddings/route.ts`
- `GET ?procedure_id=X&category=Y&limit=N` — отримати еталони (фільтр, без vector search)
- `POST { content, category, procedure_id }` — створити еталон з embedding (chief/head)
- `DELETE ?id=X` — видалити еталон (chief only)

**UI:** Довідники → вкладка «Еталони AI» (`src/components/dashboard/references/procedures/EtalonsReferenceContent.tsx`)
- Ліва панель: дерево Процес → Процедура
- Права панель: еталони обраної процедури з двома табами (описи задач / примітки звітів)
- Компонент еталонів: `src/components/dashboard/references/procedures/ProcedureEtalons.tsx`

**Seed:** `scripts/seed-etalons.mjs` — 69 курованих еталонів (47 task_description + 22 company_report_note)

## Команды

- Запуск (HTTP): `npm run dev`
- Запуск (HTTPS): `npm run dev:https`
- Сборка: `npm run build`
- Линт: `npm run lint`
- E2E: `npm run test:e2e`

## Деплой на Synology NAS

**NAS:** Synology DS920+ (`192.168.88.3`), Node.js v20, pm2 6.0

### Деплой одной командой (с PC)

```bash
bash deploy.sh
```

Скрипт выполняет: `npm run build` на PC → `tar | ssh` на NAS → `pm2 restart`

### Управление сервером на NAS

```bash
# SSH доступ (ключ ed25519, без пароля)
ssh -i ~/.ssh/id_nas maxv@192.168.88.3

# Логи (последние 50 строк)
ssh -i ~/.ssh/id_nas maxv@192.168.88.3 'PATH=/usr/local/bin:$PATH pm2 logs cs-platform --lines 50 --nostream'

# Логи (в реальном времени, Ctrl+C для выхода)
ssh -i ~/.ssh/id_nas maxv@192.168.88.3 'PATH=/usr/local/bin:$PATH pm2 logs cs-platform'

# Статус
ssh -i ~/.ssh/id_nas maxv@192.168.88.3 'PATH=/usr/local/bin:$PATH pm2 status'

# Рестарт
ssh -i ~/.ssh/id_nas maxv@192.168.88.3 'PATH=/usr/local/bin:$PATH pm2 restart cs-platform'

# Стоп
ssh -i ~/.ssh/id_nas maxv@192.168.88.3 'PATH=/usr/local/bin:$PATH pm2 stop cs-platform'

# Мониторинг CPU/RAM
ssh -i ~/.ssh/id_nas maxv@192.168.88.3 'PATH=/usr/local/bin:$PATH pm2 monit'
```

### Структура на NAS

| Путь | Описание |
|------|----------|
| `/volume1/docker/reportib/` | Рабочая директория |
| `.env.local` | Секреты (скопированы вручную, НЕ в git) |
| `certificates/` | TLS сертификаты (скопированы вручную, НЕ в git) |
| `node_modules/` | Production зависимости (`npm ci --omit=dev`) |
| `.next/` | Сборка (синхронизируется при деплое) |

### Примечания

- `/usr/local/bin` НЕ в PATH для SSH — всегда добавлять `PATH=/usr/local/bin:$PATH`
- `scp` без флага `-O` не работает (нет SFTP) — использовать `scp -O` или `tar | ssh`
- Автозапуск при перезагрузке NAS: pm2 + systemd (`pm2-maxv.service`)
- При изменении `package.json` — на NAS выполнить: `cd /volume1/docker/reportib && npm ci --omit=dev`

## E2E примечания

- Тесты: `tests/e2e/*`.
- Авторизация в тестах подготавливается через cookie/localStorage (fixtures/setup).
- Если сервер уже запущен: `PLAYWRIGHT_SKIP_SERVER=true`.

## Карта документации

- Архитектура (source of truth): `docs/ARCHITECTURE.md`
- Архитектурные решения: `docs/DECISIONS.md`
- Бизнес-требования: `docs/BUSINESS_REQUIREMENTS.md`
- Бот (Telegram + Teams): `docs/TELEGRAM_BOT.md`
- Knowledge Base (RAG): `docs/KB_RAG.md`
- UI Design System: `docs/UI_DESIGN_SYSTEM.md`
- Two-Panel стандарт: `docs/TWO_PANEL_TAB_STANDARD.md`
- Руководство пользователя: `docs/USER_GUIDE.md`
- Схема БД: `docs/database/SCHEMA.md`
- Использование БД: `docs/database/TABLES_USAGE.md`



# ===== FILE: TWO_PANEL_TAB_STANDARD.md =====

﻿# Стандарт двухпанельного интерфейса

> Последнее обновление: 2026-03-03

## 1. Основной компонент

Использовать:

```tsx
import { TwoPanelLayout } from '@/components/dashboard/shared';
```

Источник:

- `src/components/dashboard/shared/TwoPanelLayout.tsx`

## 2. Обязательный паттерн

- левая панель: список/фильтры/навигация
- правая панель: детали/форма/действия
- desktop: split-layout
- mobile: детали в `BottomDrawer`

## 3. Актуальные props `TwoPanelLayout`

- `leftPanel: ReactNode`
- `rightPanel: ReactNode`
- `resizable?: boolean` (по умолчанию `true`)
- `initialWidth?: number` (по умолчанию `480`)
- `minWidth?: number` (по умолчанию `280`)
- `maxWidth?: number` (по умолчанию `600`)
- `isDrawerOpen?: boolean`
- `onDrawerClose?: () => void`
- `containerClassName?: string`
- `leftPanelClassName?: string`
- `rightPanelClassName?: string`
- `resizerClassName?: string`
- `mobileDrawerContentClassName?: string`

## 4. Сопутствующие shared-компоненты

- `DashboardTopTabs`
- `GroupHeader`
- `GradientDetailCard`
- `DetailSection`
- `ReferenceListItem`
- `DashboardStatCard`
- `ExpandableListItem`

Экспорт:

- `src/components/dashboard/shared/index.ts`

## 5. Правила применения

1. Не реализовывать split-layout вручную для новых экранов.
2. Скролл держать на уровне содержимого панелей, а не на странице оболочки приложения.
3. На мобильных управлять деталями через состояние drawer (`isDrawerOpen`).
4. Тоны/цвета панелей держать консистентными с семантикой раздела.
5. Тяжелые формы и карточки редактирования размещать в правой панели.

## 6. Минимальный пример

```tsx
<TwoPanelLayout
  leftPanel={<ReferenceList />}
  rightPanel={<ReferenceDetails />}
  isDrawerOpen={isDrawerOpen}
  onDrawerClose={() => setDrawerOpen(false)}
  initialWidth={460}
  rightPanelClassName="bg-indigo-50/30"
/>
```







# ===== FILE: UI_DESIGN_SYSTEM.md =====

﻿# UI дизайн-система

> Последнее обновление: 2026-03-03

## 1. Источник истины

Основные дизайн-константы определены в:

- `src/styles/design-system.ts`
- `src/styles/globals.css`

## 2. Токены и примитивы

### Цвета

- базовая палитра: `colors.primary`, `colors.gray`
- семантические статусы: `colors.status` (`success`, `warning`, `error`, `info`)
- KPI-статусы: `colors.kpi`

### Отступы

Шкала отступов в `spacing`:

- `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`

### Типографика

Типографические константы:

- `typography.fontFamily`
- `typography.fontSize`
- `typography.fontWeight`

### Тени и брейкпоинты

- `shadows`: `sm`, `base`, `md`, `lg`, `xl`
- `breakpoints`: `sm`, `md`, `lg`, `xl`, `2xl`

## 3. Базовые UI-компоненты

Переиспользуемые UI-элементы:

- `src/components/ui/Button.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/BottomDrawer.tsx`
- `src/components/ui/Spinner.tsx`

Shared-компоненты для дашборда/справочников (`src/components/dashboard/shared/`):

- `TwoPanelLayout.tsx` — двухпанельный layout (список + детали)
- `DashboardTopTabs.tsx` — верхние табы секций
- `GroupHeader.tsx` — заголовок группы
- `GradientDetailCard.tsx` — карточка с градиентом
- `DetailSection.tsx` — секция деталей
- `ReferenceListItem.tsx` — элемент списка справочника
- `DashboardStatCard.tsx` — карточка статистики
- `FilterBar.tsx` — панель фильтров
- `ExpandableListItem.tsx` — раскрываемый элемент
- `MobileDetailsFab.tsx` — FAB для мобильной версии

## 4. Конвенции компоновки

- дашборд работает в единой оболочке приложения на `/`
- для справочников/отчетов/планов применять двухпанельный паттерн, где это уместно
- на мобильных детализация открывается через `BottomDrawer`

## 5. Базовые требования доступности (A11y)

- интерактивные элементы должны иметь текст или корректный `aria-label`
- обязательна клавиатурная навигация (`Tab`, `Enter`, `Space`, `Escape`)
- focus-состояния должны быть видимыми
- декоративные иконки помечать `aria-hidden`

## 6. Правила стилизации

- использовать `cn(...)` для условной композиции классов
- не вводить случайные «одноразовые» размеры, если есть токен
- предпочитать явные transition-свойства вместо широкого `transition-all`
- сохранять семантическую консистентность тонов/цветов между разделами

## 7. Loading и Error states

### Loading

- Полноэкранная загрузка: `<Spinner />` из `@/components/ui/Spinner` (размеры: sm, md, lg)
- Inline загрузка (кнопки, поля): иконка с `animate-spin`
- Списки: CSS-скелетоны (`animate-pulse`, серые блоки по форме контента)
- Данные из TanStack Query: проверять `isLoading` → показывать Spinner/скелетон

```tsx
// Стандартный паттерн
if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
if (error) return <div className="text-center py-8 text-red-500">{getErrorMessage(error)}</div>;
```

### Error

- Ошибки загрузки данных: текст `text-red-500` по центру контейнера
- Ошибки форм: красная рамка `border-red-500` + текст под полем `text-red-500 text-xs`
- Утилита: `getErrorMessage(error)` из `@/lib/shared/utils/error-message`

### Notifications (Toast)

- Библиотека: `sonner` (Toaster подключён в `app/layout.tsx`)
- Успех: `toast.success('Сохранено')`
- Ошибка: `toast.error('Ошибка: ...')`
- Позиция: top-right (по умолчанию)
- Не использовать для критичных ошибок (только toast + inline error)

## 8. Связанные документы

- `docs/TWO_PANEL_TAB_STANDARD.md`
- `docs/DEVELOPER_GUIDE.md`





