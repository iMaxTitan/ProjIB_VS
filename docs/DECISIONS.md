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

### [1] Custom PostgREST JWT замість PostgreSQL/PostgREST Auth
**Рішення:** Server-side JWT (HS256) після Azure AD login
**Відкинуто:** PostgreSQL/PostgREST Auth, NextAuth (migrated to PostgREST)
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
**Відкинуто:** PostgreSQL/PostgREST realtime, Redis (not available with PostgREST)
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
