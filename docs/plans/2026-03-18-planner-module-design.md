# Планувальник (Planner) — Design Document

> Дата: 2026-03-18
> Статус: Draft v2 (після code review)

## Проблема

Модуль Кабінет перетворився на комбайн: статистика, відпустки, профіль, бот-налаштування, тижневий календар, задачі, чернетки, шаблони, Outlook sync, meeting info/summary. Це порушує модульність та ускладнює розвиток.

Паралельно, робота з задачами розмазана по 4 модулях:
- **Плани** — AddTaskModal (680 рядків), PlanWorkLog, accept/reject
- **Кабінет** — чернетки, TaskPicker, шаблони, створення з шаблонів
- **Бот** — task-wizard (Telegram)
- **task-service.ts** — лише read + companies (111 рядків)

Немає єдиного CRUD-сервісу для задач. Логіка створення дублюється.

## Рішення

Витягнути «Планувальник» — окремий модуль з окремою вкладкою в навігації. Об'єднати задачну логіку в єдиний backend-сервіс.

### Стратегія міграції — БЕЗ ЗЛАМУ існуючих модулів

**Ключовий принцип:** Plans та Bot продовжують працювати як є. Старі файли НЕ видаляються — замінюються на re-export шими. Видалення старого коду — окрема Phase 7, ПІСЛЯ тестування Планувальника.

### Що йде в Планувальник

| З Кабінету | З Планів |
|---|---|
| Тижневий календар (grid, blocks, sidebar, toolbar) | AddTaskModal (створення/редагування задачі) |
| Чернетки + "Мої задачі" | Task CRUD (create/update/delete) |
| TaskPicker + шаблони задач | Task companies distribution |
| Calendar sync (pull/push Outlook) | TaskTemplatePicker, TaskFileUpload, TaskSuggestions |
| Meeting info + AI summary | |
| AI suggest (автозаповнення) | |

### Що залишається

| В Кабінеті | В Планах (без змін до Phase 7) |
|---|---|
| Профіль + статистика (SummaryCards) | Список планів, фільтри, навігація |
| Відпустки + затвердження | Структура плану (процедури, години) |
| Налаштування бота | Accept/reject workflow (chief/head) |
| Дедлайни | PlanWorkLog + AddTaskModal (re-export) |

### AddTaskModal — один на всіх

Переноситься в `planner/`. Старий файл `plans/Tasks/AddTaskModal.tsx` стає re-export шимом:
```typescript
// plans/Tasks/AddTaskModal.tsx — SHIM (видалити в Phase 7)
export { AddTaskModal } from '@/components/dashboard/planner/AddTaskModal';
export type { AddTaskModalProps } from '@/components/dashboard/planner/AddTaskModal';
```
Plans не знає про переїзд. Все працює як раніше.

## Дизайн UI

Еталон: `demo-design3.html` → cabinet-view. Дизайн переноситься 1:1 як Планувальник.

### Layout (desktop)

```
planner-view (flex row, h: calc(100vh - 110px), gap-2)
│
├── LEFT COLUMN (w-420px, flex-col, gap-2)
│   ├── [glass-panel] Filter zone
│   │   ├── Year+Month nav (nav-group: 3 years + 3 months carousel)
│   │   └── Week nav (nav-group: 3 weeks carousel)
│   ├── [glass-panel] Procedures sidebar (scrollable, plan-item cards)
│   │   └── Each card: dept badge, process, name, dual progress bar
│   │       (synced green + distributed blue), hours breakdown
│   └── [glass-panel] Stats strip (4 stat-chips)
│       └── distributed/planned ч | synced ч | external ч | coverage %
│
└── RIGHT COLUMN (flex-col, gap-2)
    ├── [glass-panel] Calendar grid
    │   ├── detail-hdr: "Тижневий календар" + action buttons
    │   │   └── [AI Suggest] [Copy Week] [Pull Outlook] [Push Outlook]
    │   ├── hdr-sep
    │   ├── Day headers (Пн-Пт with dates, today = indigo highlight)
    │   ├── Grid (18 rows × 5 cols, 32px/row, 9:00-18:00)
    │   │   ├── Time labels left column (48px)
    │   │   ├── cal-blocks (absolute positioned, status colored)
    │   │   ├── Lunch zone (hatched background)
    │   │   └── Now line (red, today only)
    │   └── cal-footer: legend chips (5 statuses)
    │
    └── [glass-panel] My Tasks panel
        ├── Header: clipboard icon + "Мої задачі (N)" + [+] + collapse chevron
        ├── Quick input: "аудит сервера 2ч" parser
        ├── Drafts section (amber): date | desc | plan-select | assign | hours | delete
        └── Incomplete section (sky): date | desc | procedure | hours | delete
```

### Design Hierarchy (demo-design3)

```
L0  body           — page gradient background
L1  .glass-panel   — zone (sidebar, filter, stats, grid panel, tasks panel)
L2  .element-card  — element inside zone (.plan-item, .proc-item, .cal-table)
L3  .data-cell     — item inside element (.cal-block, .task-row, .draft-row)
```

### Status Colors (shared .data-cell.st-*)

| Status | Color | Meaning |
|---|---|---|
| st-distributed | blue | Plan entry on calendar |
| st-synced | emerald | Synced with Outlook |
| st-draft-task | amber | Draft task created |
| st-in-task | emerald | Linked to completed task |
| st-external | slate | External event (Outlook) |

### Mobile Layout

- Day tabs (swipeable) OR week overview (compact 5-col)
- View toggle: day/week mode
- FAB buttons: "Плани" + "Задачі" (open bottom sheet)
- Bottom sheet: procedures OR tasks panel content
- Touch swipe for day switching

### Navigation

Окрема вкладка в HorizontalNav:
- Icon: Calendar (rect + lines)
- Label: "Планувальник"
- Position: після "Плани", перед "Звіти" (для chief/head) або перед "Кабінет" (для employee)
- Roles: chief, head, analyst, employee (всі web-юзери)
- Route: `/dashboard/planner` (inside dashboard layout, consistent with all other pages)

## Backend Architecture

### Нова структура файлів

```
lib/ops/planner/                         ← НОВИЙ модуль
├── task-service.ts                      ← єдиний CRUD задач (~250 рядків)
│   └── createTask, updateTask, deleteTask, getTasksByPlan,
│       getWeeklyTasksSpentHours, getTaskCompanies, updateTaskCompanies
├── task-templates.ts                    ← шаблони (з cabinet/, ~90 рядків)
├── task-validation.ts                   ← ліміти годин, перевірки (~80 рядків)
├── drafts.ts                            ← чернетки + assign (~280 рядків)
├── calendar-entries.ts                  ← read entries (~230 рядків)
├── calendar-entries-write.ts            ← write entries (~240 рядків)
├── calendar-shared.ts                   ← time helpers (з cabinet/)
├── calendar-sync.ts                     ← pull from Outlook (з cabinet/)
├── calendar-sync-reconcile.ts           ← event matching (з cabinet/)
├── calendar-sync-backfill.ts            ← subject/transcript (з cabinet/)
├── calendar-push.ts                     ← push to Outlook (з cabinet/)
├── weekly-suggest.ts                    ← orchestrator (~150 рядків)
├── weekly-suggest-strategies.ts         ← repeat-week + proportional (~200 рядків)
├── meeting-details.ts                   ← Graph → meeting info (~125 рядків)
└── meeting-summary.ts                   ← AI summary (~157 рядків)

hooks/
├── usePlanner.ts                        ← useWeeklyEntries, useCreateEntry,
│                                           useUpdateEntry, useDeleteEntry,
│                                           useSuggestSlots, useLinkTaskToEntry
│                                           (з useWeeklyPlanner.ts + useTaskLink.ts)
├── usePlannerSync.ts                    ← usePullCalendar, usePushCalendar
│                                           (з useCalendarSync.ts)
├── usePlannerTasks.ts                   ← task CRUD hooks (НОВИЙ)
├── usePlannerDrafts.ts                  ← drafts + suggest (з useDraftTasks.ts)
└── useTaskTemplates.ts                  ← шаблони (НОВИЙ)

components/dashboard/planner/            ← НОВИЙ UI модуль
├── PlannerContent.tsx                   ← головна сторінка, layout
├── PlannerSidebar.tsx                   ← procedures list (з WeeklyPlannerSidebar)
├── PlannerFilters.tsx                   ← year/month/week nav (з WeeklyPlannerToolbar)
├── PlannerStats.tsx                     ← stat chips (НОВИЙ)
├── PlannerGrid.tsx                      ← calendar grid (з WeeklyPlannerGrid)
├── PlannerBlocks.tsx                    ← block rendering (з WeeklyPlannerBlocks)
├── PlannerToolbar.tsx                   ← header action buttons
├── TasksPanel.tsx                       ← My Tasks (з CabinetMyTasks)
├── TaskPickerDropdown.tsx               ← вибір задачі для слоту (з cabinet/)
├── CalendarMeetingModal.tsx             ← інфо про зустріч (з cabinet/)
├── AddTaskModal.tsx                     ← ЄДИНИЙ модал (з plans/Tasks/)
├── TaskTemplatePicker.tsx               ← шаблони (з plans/Tasks/)
├── TaskSuggestions.tsx                  ← AI підказки (з plans/Tasks/)
├── TaskFileUpload.tsx                   ← завантаження файлів (з plans/Tasks/)
├── CompanyDistributionSelector.tsx      ← розподіл годин (з plans/Tasks/)
└── planner-helpers.ts                   ← утиліти (з weekly-planner-helpers.ts)

app/api/planner/                         ← НОВІ API routes
├── entries/route.ts                     ← GET/POST/PATCH/DELETE entries
├── entries/suggest/route.ts             ← автозаповнення слотів
├── entries/copy/route.ts                ← копія тижня
├── entries/lunch/route.ts               ← PATCH lunch_start
├── tasks/route.ts                       ← GET picker / POST create task
├── tasks/[id]/route.ts                  ← PATCH/DELETE task
├── drafts/route.ts                      ← GET/POST/DELETE drafts
├── drafts/assign/route.ts              ← POST draft → plan
├── drafts/suggest/route.ts             ← POST AI suggest
├── templates/route.ts                   ← GET/POST/PATCH/DELETE templates
├── templates/generate/route.ts          ← POST AI generate
├── meetings/info/route.ts              ← POST meeting info
├── meetings/summary/route.ts           ← POST AI summary
├── sync/pull/route.ts                   ← POST delta sync з Outlook
└── sync/push/route.ts                   ← POST batch push в Outlook

app/dashboard/planner/                   ← page route (inside dashboard layout)
└── page.tsx
```

### Re-export шими (замість видалення)

Старі файли замінюються на шими. Plans, Bot, Cabinet продовжують працювати.
Видалення шимів — Phase 7 (після тестування).

```
ЗАМІНИТИ НА RE-EXPORT ШИМИ:
  lib/ops/cabinet/calendar-entries.ts     → export * from '@/lib/ops/planner/calendar-entries'
  lib/ops/cabinet/calendar-entries-write.ts → export * from '@/lib/ops/planner/calendar-entries-write'
  lib/ops/cabinet/calendar-shared.ts      → export * from '@/lib/ops/planner/calendar-shared'
  lib/ops/cabinet/calendar-sync.ts        → export * from '@/lib/ops/planner/calendar-sync'
  lib/ops/cabinet/calendar-sync-reconcile.ts → export * from '@/lib/ops/planner/...'
  lib/ops/cabinet/calendar-sync-backfill.ts  → export * from '@/lib/ops/planner/...'
  lib/ops/cabinet/calendar-push.ts        → export * from '@/lib/ops/planner/calendar-push'
  lib/ops/cabinet/drafts.ts              → export * from '@/lib/ops/planner/drafts'
  lib/ops/cabinet/task-templates.ts      → export * from '@/lib/ops/planner/task-templates'
  lib/ops/cabinet/weekly-planner-suggest.ts → export * from '@/lib/ops/planner/weekly-suggest'
  lib/ops/cabinet/meeting-details.ts     → export * from '@/lib/ops/planner/meeting-details'
  lib/ops/cabinet/meeting-summary.ts     → export * from '@/lib/ops/planner/meeting-summary'
  lib/ops/tasks/task-service.ts          → export * from '@/lib/ops/planner/task-service'
  lib/ops/tasks/index.ts                 → export * from '@/lib/ops/planner/task-service'
  hooks/useWeeklyPlanner.ts              → export * from '@/hooks/usePlanner'
  hooks/useCalendarSync.ts               → export * from '@/hooks/usePlannerSync'
  hooks/useDraftTasks.ts                 → export * from '@/hooks/usePlannerDrafts'
  hooks/useTaskLink.ts                   → export { useLinkTaskToEntry } from '@/hooks/usePlanner'
  hooks/useTaskOps.ts                    → export * from '@/lib/ops/planner/task-service'

ЗАМІНИТИ НА RE-EXPORT ШИМИ (компоненти):
  components/dashboard/plans/Tasks/AddTaskModal.tsx → re-export from planner/
  components/dashboard/plans/Tasks/TaskTemplatePicker.tsx → re-export from planner/
  components/dashboard/plans/Tasks/TaskSuggestions.tsx → re-export from planner/
  components/dashboard/plans/Tasks/TaskFileUpload.tsx → re-export from planner/
  components/dashboard/plans/Tasks/CompanyDistributionSelector.tsx → re-export from planner/

ЗАМІНИТИ НА RE-EXPORT ШИМИ (cabinet UI — для старих API routes):
  components/dashboard/cabinet/CabinetWeeklyPlanner.tsx → видалити (Cabinet прибирає)
  components/dashboard/cabinet/CabinetMyTasks.tsx → видалити (Cabinet прибирає)
  components/dashboard/cabinet/WeeklyPlannerGrid.tsx → re-export from planner/PlannerGrid
  components/dashboard/cabinet/WeeklyPlannerBlocks.tsx → re-export from planner/PlannerBlocks
  components/dashboard/cabinet/WeeklyPlannerSidebar.tsx → re-export from planner/PlannerSidebar
  components/dashboard/cabinet/WeeklyPlannerToolbar.tsx → re-export from planner/PlannerToolbar
  components/dashboard/cabinet/TaskPickerDropdown.tsx → re-export from planner/
  components/dashboard/cabinet/CalendarMeetingModal.tsx → re-export from planner/
  components/dashboard/cabinet/weekly-planner-helpers.ts → re-export from planner/

СТАРІ API ROUTES — залишити поки працюють
  app/api/cabinet/weekly-planner/        → залишити (старі хуки ходять сюди)
  app/api/cabinet/drafts/                → залишити
  app/api/cabinet/task-templates/        → залишити
  app/api/calendar/pull/                 → залишити
  app/api/calendar/sync/                 → залишити

ЗАЛИШИТИ В CABINET (без змін):
  lib/ops/cabinet/stats.ts
  lib/ops/cabinet/absences.ts (+ split files)
  hooks/useCabinetStats.ts
  hooks/useAbsences.ts
  components/dashboard/cabinet/CabinetContent.tsx (спрощений — видалити WeeklyPlanner + MyTasks)
  components/dashboard/cabinet/CabinetSummaryCards.tsx
  components/dashboard/cabinet/CabinetVacation*.tsx
  components/dashboard/cabinet/CabinetProfile.tsx
  components/dashboard/cabinet/CabinetBotSettings.tsx
  components/dashboard/cabinet/CabinetDeadlines.tsx
  components/dashboard/cabinet/CabinetApprovals.tsx
  app/api/cabinet/stats/
  app/api/cabinet/absences/
```

### task-service.ts — єдиний CRUD

Збирає розмазану логіку створення/оновлення/видалення задач:

```typescript
// lib/ops/planner/task-service.ts

// READ (з поточного task-service.ts)
export function getTasksByMonthlyPlanId(db, planId)
export function getWeeklyTasksSpentHours(db, userId, weekStart)
export function getTaskCompanies(db, taskId)

// WRITE (зараз в компонентах/хуках — витягнути в API)
export function createTask(db, params: CreateTaskParams): Promise<DailyTask>
export function updateTask(db, taskId, userId, params: UpdateTaskParams): Promise<DailyTask>
export function deleteTask(db, taskId, userId): Promise<void>
export function updateTaskCompanies(db, taskId, companyIds, distributionType)

// DRAFT WORKFLOW (з cabinet/drafts.ts)
export function assignDraftToPlan(db, draftId, planId, userId)
```

### Що міняється в Plans

НІЧОГО на Phase 1-6. Plans продовжує працювати як є через re-export шими.

Phase 7 (після тестування Планувальника):
- `PlansContent.tsx` — оновити import AddTaskModal з planner/
- `PlanWorkLog.tsx` — оновити import AddTaskModal з planner/
- `MonthlyPlanDetails.tsx` — оновити import
- `useMonthlyPlanData.ts` — оновити import getTasksByMonthlyPlanId з planner/
- `useTaskOps.ts` — видалити (замінений usePlannerTasks)
- Видалити всі re-export шими
- Видалити старі API routes

### Що міняється в Bot

НІЧОГО на Phase 1-6. Bot task wizard має свої `queries.ts` з прямими Supabase запитами.

Phase 7: оновити task wizard на `createTask` з `lib/ops/planner/task-service.ts`.

## План реалізації

### Phase 1: Backend — services (lib/ops/planner/)
1. Створити `lib/ops/planner/` каталог
2. Перенести calendar-* файли (7 шт) — копіювати, оновити внутрішні imports
3. Перенести drafts.ts, meeting-*.ts, task-templates.ts
4. Split weekly-planner-suggest.ts → weekly-suggest.ts + weekly-suggest-strategies.ts (≤300 рядків кожен)
5. Створити task-service.ts — зібрати CRUD з розмазаних місць
6. Створити task-validation.ts
7. Замінити старі файли на re-export шими (cabinet/, tasks/)
8. `npm run typecheck` — 0 errors

### Phase 2: API routes (app/api/planner/)
1. Створити всі route файли в `app/api/planner/`
2. Imports вказують на `lib/ops/planner/`
3. Старі routes НЕ видаляти — залишити працюючими
4. `npm run typecheck` — 0 errors

### Phase 3: Hooks
1. Створити usePlanner.ts (entries + link-task mutation), usePlannerSync.ts, usePlannerTasks.ts, usePlannerDrafts.ts, useTaskTemplates.ts
2. Нові хуки ходять на `/api/planner/...`
3. Замінити старі хуки на re-export шими
4. `npm run typecheck` — 0 errors

### Phase 4: Frontend — components
1. Створити `components/dashboard/planner/` каталог
2. Перенести компоненти з cabinet/ (Weekly*, TaskPicker, CalendarMeeting, helpers)
3. Перенести з plans/Tasks/ (AddTaskModal, TaskTemplatePicker, TaskSuggestions, TaskFileUpload, CompanyDistributionSelector)
4. Створити PlannerContent.tsx (головна сторінка, layout по demo-design3)
5. Створити PlannerFilters.tsx, PlannerStats.tsx, PlannerToolbar.tsx
6. Замінити старі файли (cabinet/, plans/Tasks/) на re-export шими
7. `npm run typecheck` — 0 errors

### Phase 5: Navigation + Cabinet cleanup
1. Додати "Планувальник" вкладку в HorizontalNav
2. Створити route `app/dashboard/planner/page.tsx`
3. Спростити CabinetContent.tsx — видалити CabinetWeeklyPlanner + CabinetMyTasks
4. `npm run typecheck` + `npm run lint` + `npm run build` — 0 errors

### Phase 6: Verify
1. Ручна перевірка: планувальник відкривається, grid працює, drag-drop
2. Ручна перевірка: Plans → AddTaskModal працює як раніше (через re-export)
3. Перевірка: Outlook sync pull/push працює
4. Перевірка: чернетки, шаблони, meeting info
5. Оновити glossary.md
6. Оновити ARCHITECTURE.md
7. Оновити demo-design3.html (tab name → "Планувальник")

### Phase 7: Cleanup (ПІСЛЯ тестування, окрема задача)
1. Видалити re-export шими з cabinet/, tasks/, plans/Tasks/
2. Оновити imports в Plans: PlansContent, PlanWorkLog, MonthlyPlanDetails, useMonthlyPlanData
3. Оновити imports в Bot: task-wizard queries
4. Видалити старі API routes: cabinet/weekly-planner/, cabinet/drafts/, cabinet/task-templates/, calendar/pull/, calendar/sync/
5. Видалити useTaskOps.ts
6. `npm run typecheck` + `npm run build` — 0 errors

## Code Review Findings (v1 → v2)

Зміни внесені за результатами code review:

| # | Проблема | Виправлення |
|---|----------|-------------|
| 1 | AddTaskModal робить прямі Supabase виклики | Виправити в Phase 4 — перевести на `/api/planner/tasks` |
| 2 | useTaskOps.ts зламається при видаленні task-service | Re-export шим замість видалення |
| 3 | useMonthlyPlanData.ts імпортує з task-service | Re-export шим; міграція в Phase 7 |
| 4 | PlansContent.tsx теж імпортує AddTaskModal | Re-export шим; міграція в Phase 7 |
| 5 | useTaskLink.ts — link-task мутація не в нових хуках | Додано useLinkTaskToEntry в usePlanner.ts |
| 6 | weekly-suggest.ts ~340 рядків > 300 ліміт | Split на orchestrator + strategies |
| 7 | app/planner/ поза dashboard layout | Виправлено: app/dashboard/planner/ |
| 8 | TaskFileUpload + TaskSuggestions не в списку переносу | Додані до Phase 4 |
| 9 | Phase ordering — видалення до оновлення хуків | Замінено на re-export шими (нічого не ламається) |

## Tech Debt (відкладено)

- [ ] Переробити AddTaskModal під demo-design3.html (680 рядків, старий стиль)
- [ ] Переробити CalendarMeetingModal під demo-design3.html
- [ ] Транзакції для calendar-sync (partial state)
- [ ] Per-entry status map для batch push (замість лічильників)
- [ ] Перевірити RLS на daily_tasks / weekly_calendar_entries
- [ ] AddTaskModal — прибрати прямі supabase виклики, перевести на API hooks
