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
│   │   │   └── laws/             #   Законодавство: search, fetch, related, check-update, import
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
│   │   └── debug/                #   graph-test, memory
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
│   ├── useLawSearch.ts           #   Law search (URL/number) + related acts
│   ├── useLawLibrary.ts          #   Laws table + update check (3 workers parallel)
│   ├── useLawImport.ts           #   Law import with progress tracking
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
│   │   └── bot-adapter.ts        #   Bot integration (kbSearchTool)
│   │
│   ├── ops/
│   │   ├── laws/                  # ═══ LAWS MODULE (Законодавство) ═══
│   │   │   └── fetcher-client.ts  #   Proxy to law-fetcher microservice on DB VPS
│   │   │                          #   search (by URL/number), fetch, related, check-update
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
task_type: draft → incomplete → completed
source: manual | template | chief | head | manager | calendar

Completion rules:
  manual/template: auto-completed коли hours > 0 AND description filled
  chief/head:      completed ТІЛЬКИ через accept від керівника
  calendar:        auto-completed на основі годин

Chief/Head flow:
  Керівник створює задачу (source='chief'|'head', task_type='draft')
  → Співробітник заповнює (hours, description) → task_type='incomplete'
  → Керівник accept ✓ → task_type='completed'
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
| 2026-03 | **Planner v3 — calendar flow redesign:** Design doc: `docs/plans/2026-03-20-planner-calendar-flow.md`. New column `needs_push` (boolean) on `weekly_calendar_entries` — tracks local changes needing Outlook sync. 7 tile statuses: distributed (blue), synced (green), modified (cyan, needs_push), returned (red, outlook_modified), templated (amber, task_template_id set), collected (purple, daily_task_id set), external (gray). Push now updates existing Outlook events (PATCH) instead of delete+create — `outlook_event_id` never cleared on edits. Pull detects deleted plan events in Outlook (clears outlook_event_id). Template picker writes `task_template_id` on entry (no daily_task creation). Collect without modal: groups entries by template, creates daily_tasks per group. Tile text shows template_title when set. Resize/drag on synced entries sets needs_push=true. Returned entries become editable on drag/resize (clears outlook_modified). ReadOnly: collected + external (without template). |
