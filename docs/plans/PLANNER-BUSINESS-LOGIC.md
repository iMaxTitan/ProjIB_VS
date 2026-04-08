# Модуль "Планувальник" (Planner) — Бизнес-логика

> Полное описание бизнес-логики, UI-флоу и взаимодействий модуля планувальника.
> Дата аудита: 2026-03-23

---

## 1. Архитектурный обзор

### Слои

```
UI (components/dashboard/planner/)
  → Hooks (hooks/usePlanner*.ts, useTaskTemplates.ts)
    → API (app/api/planner/)
      → Services (lib/ops/planner/)
        → PostgreSQL/PostgREST DB + Microsoft Graph API
```

### Центральная таблица: `weekly_calendar_entries`

Связи: `monthly_plans`, `daily_tasks`, `procedure_task_templates`, `planned_absences`, `calendar_sync_state`, `meeting_cache`.

---

## 2. Типы записей в календаре

### 2.1. `source = 'plan'` — плановая запись

Создаётся пользователем (drag процедуры на сетку или accept ghost-блока).
Обязательный FK: `monthly_plan_id`. Опциональные: `task_template_id`, `daily_task_id`.
Именно эти записи пушатся в Outlook.

**Ограничения при создании** (`calendar-entries-write.ts`):
- Время только 9:00–18:00
- Нельзя в день отпуска (`planned_absences` с `status in ('approved','pending')`)
- Нельзя с пересечением (если не `skipOverlapCheck`)

### 2.2. `source = 'external'` — внешнее событие из Outlook

Создаётся ТОЛЬКО через Pull-синхронизацию. Нельзя создать/удалить вручную.
Может получить `monthly_plan_id` (перетаскивание процедуры на внешний блок)
и `task_template_id`.

### 2.3. Обед

НЕ запись в БД. Визуальная зона в UI по `user_profiles.lunch_start`.
Настройка через `PATCH /api/planner/entries/lunch`.
Допустимые значения: `12:00, 12:30, 13:00, 13:30`.

### 2.4. Ghost-блоки (suggestions)

Существуют только в React state, в БД не хранятся.
Создаются через `GET /api/planner/entries/suggest`.
Принятый ghost становится `source='plan'` записью.

---

## 3. Lifecycle записи в календаре

### 3.1. Создание

```
User drags procedure card → handleDragEnd (PlannerContent.tsx)
  → resolveOverlaps() — если слот занят, каскадно двигает соседей
  → createEntry.mutate()
    → POST /api/planner/entries
      → createEntry() (calendar-entries-write.ts)
        → INSERT weekly_calendar_entries (source='plan', needs_push=false)
```

Оптимистичный update: UI сразу добавляет `_optimistic_${Date.now()}` запись,
откатывается при ошибке.

### 3.2. Редактирование

`PATCH /api/planner/entries` → `updateEntry()`:
- Запрещено менять время если `daily_task_id IS NOT NULL` (запись уже собрана)
- Смена времени + есть `outlook_event_id`: `needs_push = true`, `outlook_modified = false`
- Смена `task_template_id` + есть `outlook_event_id`: `needs_push = true`
- Перемещение между днями: старый Outlook-event УДАЛЯЕТСЯ, при следующем Push создастся новый

### 3.3. Удаление

`DELETE /api/planner/entries?id=X` → `deleteEntry()`:
- Запрещено если `daily_task_id IS NOT NULL`
- Запрещено для `source = 'external'`
- Если есть `outlook_event_id`: best-effort удаление в Outlook (ошибка только логируется)

### 3.4. Каскадное разрешение пересечений ("пятнашки")

`resolveOverlaps()` в `planner-helpers.ts`:
- **Fixed:** перемещённая/созданная запись + все `source='external'`
- **Flexible:** остальные `source='plan'`, сортируются по start_time
- Flexible-записи последовательно двигаются вниз до свободного места
- Если не влезают до 18:00 — прижимаются к `WORK_END_MIN - duration`
- Смещения отправляются отдельными PATCH с `cascade: true` (skipOverlapCheck)

---

## 4. Синхронизация с Outlook

### 4.1. PULL (Outlook → DB)

`POST /api/planner/sync/pull` → `pullCalendarEvents()` (`calendar-sync.ts`)

**Режимы:**
- `mode='full'`: полный запрос за диапазон дат
- `mode='delta'`: инкрементальный по `delta_token` из `calendar_sync_state`

**Автоматический PULL:** при смене недели (`useEffect` на `weekStartStr`).

**Reconcile алгоритм** (`calendar-sync-reconcile.ts`):

| Событие | Plan-запись | External-запись |
|---------|------------|----------------|
| `@removed` | Очистить `outlook_event_id` (запись остаётся) | Удалить (если нет `daily_task_id`) |
| Наш pushed event, изменён | UPDATE + `outlook_modified = true` | — |
| Новый external | — | INSERT `source='external'` |
| Существующий external | — | LWW по `lastModifiedDateTime` |

**Перед reconcile:** очищается `outlook_modified = false` для всей недели —
reconcile ставит обратно только для действительно изменённых.

**Backfill после reconcile:**
- `backfillMissingSubjects()`: delta иногда не возвращает subject для recurring → доп. запрос
- `backfillTranscriptStatus()`: для прошлых online-совещаний проверяет наличие транскрипта

### 4.2. PUSH (DB → Outlook)

`POST /api/planner/sync/push` → `pushToOutlook()` (`calendar-push.ts`)

Использует Graph `$batch` API (макс 20 запросов на вызов).

**Новые записи** (`outlook_event_id IS NULL`, `source='plan'`):
- POST → получаем Outlook event ID → сохраняем, `needs_push=false`

**Изменённые записи** (`needs_push=true`, `outlook_event_id NOT NULL`):
- PATCH → `needs_push=false`
- 404 → unlink: `outlook_event_id=null`, `needs_push=false`

**Содержимое Outlook-события** (`buildOutlookEvent()`):
- subject = `procedure_name`
- showAs = `'busy'`
- categories = `['CS Platform']`
- singleValueExtendedProperties с GUID для обратной связи

Категория `'CS Platform'` создаётся через `ensureMasterCategory()` перед каждым push.

### 4.3. Поле `needs_push`

| Событие | needs_push |
|---------|-----------|
| Создание записи | false |
| Push выполнен | false |
| Изменение времени/шаблона у synced-записи | true |
| PULL: Outlook-событие удалено | false + unlink |

### 4.4. Поле `outlook_modified`

`true` когда Pull обнаружил изменение в Outlook (время или subject).
Визуально: иконка `AlertTriangle`, статус `'returned'`.

---

## 5. Статусы блоков (`entryStatus`)

`PlannerBlocks.tsx` — `entryStatus(entry)`:

| Приоритет | Условие | CSS-класс | Значение |
|-----------|---------|-----------|----------|
| 1 | `daily_task_id` NOT NULL | `st-collected` | Задача собрана |
| 2 | `outlook_modified = true` | `st-returned` | Изменено в Outlook |
| 3 | `task_template_id` NOT NULL | `st-templated` | Шаблон назначен |
| 4 | `outlook_event_id` AND `needs_push` | `st-modified` | Локально изменено |
| 5 | `outlook_event_id` (без needs_push) | `st-synced` | Синхронизировано |
| 6 | `source = 'external'` | `st-external` | Внешнее событие |
| 7 | иначе | `st-distributed` | Распределено |

---

## 6. Недельная сетка

### Параметры

- `START_HOUR = 9`, `END_HOUR = 18`, `SLOT_STEP = 30 мин`
- `ROWS = 18` (9 часов × 2 слота), `ROW_HEIGHT = 32px`

### Позиционирование

- `top = timeToRow(start_time) * ROW_HEIGHT + 1`
- `height = durationToRows(duration) * ROW_HEIGHT - 2`

### Перекрытие слотов

`computeOverlapLayout()` в `planner-helpers.ts` — sweep line алгоритм,
раскладывает конфликтующие блоки в колонки.
Ширина = `(1/totalColumns)*100%`, offset = `(column/totalColumns)*100%`.

### Drag & Drop

- `GridCell` — droppable-зона (dnd-kit `useDroppable`), id = `cell-{date}-{HH:MM}`
- Процедуры из sidebar — draggable
- NowLine: текущее время, обновляется каждую минуту

### Отпуска

Дни отпуска: подсвечены заголовки, `readOnly=true` для всех слотов.

---

## 7. Suggest (автозаполнение)

`GET /api/planner/entries/suggest` → `suggestWeekSlots()` (`weekly-suggest.ts`)

### Выбор стратегии

1. Предыдущая неделя имела plan-записи → **Strategy 1: repeat previous week**
2. Иначе, есть активные планы → **Strategy 2: proportional**

### Strategy 1 — Повторение прошлой недели

- Берёт записи прошлой недели, маппит дни (Mon=Mon, ...)
- Остаток бюджета = (минут прошлой недели по процедуре) - (уже запланировано)
- Занятый слот → `findFreeSlot()` ищет свободное место
- Обеденный перерыв учитывается как занятый
- Недельный cap = `MAX_WEEK_MIN(40*60)` - уже запланированное

### Strategy 2 — Пропорциональное

- `weeklyBudgetHrs = plannedHours / assigneesCount / 4`
- Веса пропорциональны оставшемуся бюджету
- Round-robin по дням, шаг 60 мин (fallback 30 мин)

`mergeConsecutiveSlots()`: последовательные слоты одной процедуры объединяются.

Vacation days: `occupiedMap` с интервалом `{9:00, 18:00}` → стратегии пропускают.

---

## 8. Drafts (черновики)

`lib/ops/planner/drafts.ts`

**Draft = `daily_task` с `monthly_plan_id IS NULL`**

### Когда создаются

1. Пользователь кликает "Зберегти як чернетку" на external meeting (без плана)
2. Источник `meetingId` (Outlook event ID) → линкуется к `weekly_calendar_entries`
3. Из бота (Telegram/Teams) — задача без привязки к плану

### Dedup

Если `meetingId` уже есть в `document_number` → возвращает существующий ID.

### Assign draft

`POST /api/planner/drafts/assign`:
- `monthly_plan_id = planId`, `task_type = 'incomplete'`
- Копирует компании из `monthly_plan_companies` → `daily_task_companies`

### getDraftsData()

Возвращает комплексный объект:
- `drafts`: tasks с `monthly_plan_id IS NULL`
- `recentTasks`: assigned tasks текущего месяца
- `activePlans`: планы для dropdown назначения
- `meetingTaskIds`, `draftSourceIds`, `assignedSourceIds`: source IDs для dedup в UI

---

## 9. Collect Tasks (сбор задач)

`collectProcedureTasks()` в `collect-tasks.ts`

### Вызов

Кнопка ClipboardCheck в PlannerSidebar (показывается когда `totalSlotHours > 0`).

### Входные данные

- **Plan entries:** `task_template_id NOT NULL` AND `daily_task_id IS NULL`, привязаны к процедуре
- **External entries:** `source='external'` AND `has_transcript=true` AND `daily_task_id IS NULL`

### Алгоритм для plan entries

1. Группировка по `task_template_id`
2. На каждую группу: `INSERT daily_tasks`:
   - `title = template.title`
   - `description = template.content`
   - `spent_hours = SUM(duration_minutes / 60)`
   - `task_date = latest_date`
   - `source = 'calendar'`
   - `task_type = 'incomplete'`
3. Линковка: `UPDATE weekly_calendar_entries SET daily_task_id = taskId`
4. Копирование компаний из `monthly_plan_companies`

### External entries

Каждая запись → отдельная задача (`title=subject`, `description=transcript_summary`).

### После collect

Записи блокируются от редактирования и удаления (`daily_task_id IS NOT NULL`).

---

## 10. Task Templates (шаблоны задач)

`lib/ops/planner/task-templates.ts` — CRUD для `procedure_task_templates`.

### Lifecycle

1. Chief/head создаёт шаблоны для процедуры (право `ROLE_GROUPS.REF_EDITORS`)
2. AI-генерация: `POST /api/planner/templates/generate` (claude-sonnet)
3. **Прямое создание задачи:** клик по шаблону в правой панели → открывает модалку с предзаполненными title/content → задача создаётся со статусом `pending_approval` (если часы > 0) или `incomplete` (если часы = 0)
4. **Через календарь (опционально):** drag шаблона на сетку → создаёт calendar entry с `task_template_id` → Collect превращает в задачу

### Soft-delete

`is_active = false` (не физическое удаление).

### Дедупликация

Шаблоны с title (lowercase), совпадающим с existing incomplete/chief задачами, скрываются из picker.

---

## 10.1. Правая панель задач (PlannerTasksDetail)

Открывается при выборе месячного плана в левом сайдбаре. Содержит 5 сворачиваемых групп:

### Группы

1. **Незавершені задачі** — собственные задачи сотрудника (`incomplete`, `pending_approval`, `rejected`, кроме chief/head)
2. **Задачі керівництва** — задачи от chief/head, ещё не completed
3. **Чернетки** — задачи без привязки к плану (из нарад и бота). Действие: привязать к текущему плану (→ `incomplete`)
4. **Шаблони задач** — активные шаблоны процедуры. Действия: клик → создать задачу напрямую; drag → в календарную сетку
5. **Завершені** — согласованные задачи (`completed`), свёрнуто по умолчанию

### Статусы задач (task_type)

```
draft ──[assign to plan]──► incomplete ──[Send]──► pending_approval ──[Accept]──► completed
                                                                    ──[Reject]──► rejected
                                                   rejected ──[Send]──► pending_approval
```

### Роли и действия

| Действие | employee | chief/head |
|----------|----------|------------|
| Send (на согласование) | ✓ свои incomplete/rejected | — |
| Accept (согласовати) | — | ✓ pending_approval |
| Reject (відхилити) | — | ✓ pending_approval |
| Edit | ✓ не completed | ✓ не completed |
| Delete | ✓ свои, не от менеджера, не completed | ✓ |

### Создание задачи из шаблона

Клик по шаблону → модалка `TasksModal` (mode: `create`) с предзаполненными title и description из шаблона. Часы > 0 → `pending_approval`, часы = 0 → `incomplete`. Календарь не обязателен.

---

## 11. Task Picker

`GET /api/planner/tasks?procedure_id=X&monthly_plan_id=Y` — 4 секции:

1. **templates:** active templates (без matching incomplete task)
2. **incomplete:** `task_type='incomplete'`, не source `chief/head`, не linked to calendar
3. **chief:** source in `('chief','head')`, not completed, not linked
4. **drafts:** `monthly_plan_id IS NULL`, limit 20

### Действия выбора (`TaskPickerDropdown`)

- `type='template'`: новая задача + линк к entry
- `type='procedure-only'`: назначение `monthly_plan_id` на external entry
- `type='task'`: существующая задача линкуется к entry

---

## 12. Meetings (совещания)

### Fetch meeting info

`POST /api/planner/meetings/info`:
- **Fast path:** `meeting_cache` по `ical_uid` (attendees, transcript_id)
- **Slow path:** Graph chain `event → attendees + joinUrl → onlineMeetingId → transcripts`
- Сохраняет в `meeting_cache` (cross-user cache)

### Generate summary

`POST /api/planner/meetings/summary`:
1. Cache: `weekly_calendar_entries.transcript_summary`
2. Cache: `meeting_cache` по `ical_uid`
3. Graph: VTT content (макс 12000 chars)
4. Claude Haiku → HTML-формат резюме
5. Сохраняет в обе таблицы

### Cross-user кэш

`meeting_cache` — один пользователь генерирует, все получают мгновенно.

---

## 13. Связь с модулем Plans

Связь через `monthly_plan_id`:
- Записи `weekly_calendar_entries` ссылаются на `monthly_plans`
- Часы из calendar НЕ автоматически попадают в `daily_tasks.spent_hours`
- **Collect** создаёт `daily_tasks` с `spent_hours = SUM(duration_minutes / 60)`
- Задачи из Plans (chief/head assignments) видны в Task Picker

### `getActivePlansForUser()`

- Ищет планы где `user_id` есть в `monthly_plan_assignees`
- Месяцы: оба если неделя пересекает границу месяца
- Статусы: `'active'` и `'completed'`
- Completed-планы: `opacity-70`, не drag-and-droppable

---

## 14. Роли и права

| Действие | Кто может |
|---------|-----------|
| Просматривать свои записи | Любой авторизованный |
| Создавать/редактировать plan entries | Владелец (свои записи) |
| Создавать task templates | chief, head, analyst (`REF_EDITORS`) |
| Менять `task_type='completed'` | Только manager (chief/head) |
| Менять `task_type='pending_approval'` | Только owner (employee) |
| Удалять task | Owner ИЛИ creator (`created_by`) |

---

## 15. Hooks и кэширование

| Hook | Cache key | staleTime |
|------|-----------|-----------|
| `useWeeklyEntries(weekStart)` | `['planner','entries',weekStart]` | 30s |
| `useDrafts()` | `['planner','drafts']` | 30s |
| `usePlanTasks(planId)` | `['planner','tasks','detail',planId]` | 30s |
| `useTemplates(procedureId)` | `['planner','templates',procedureId]` | Infinity |

### Оптимистичные обновления

`useCreateEntry`, `useUpdateEntry`, `useBatchCreateEntries` — патчат кэш локально,
откатываются при ошибке.

### Инвалидация

Все мутации инвалидируют `PLANNER_ENTRIES_KEY`.
Мутации tasks/drafts — дополнительно `['cabinet','stats']`.

---

## 16. UI-флоу: основные сценарии

### Drag procedure → grid cell

1. Проверяет: нет ли external entry в слоте (если есть → assign procedure)
2. Создаёт временный `_tmp_` entry для `resolveOverlaps()`
3. `createEntry.mutate()` + cascade shifts

### Click на plan block

1. Открывается `TaskPickerDropdown` — список шаблонов/задач
2. Select template → `updateEntry(task_template_id)` → `st-templated`
3. Select task → link task to entry

### Click на external block

1. Открывается `CalendarMeetingModal`
2. Загружаются attendees (fast path cache, slow path Graph)
3. "Згенерувати AI резюме" → POST /api/planner/meetings/summary
4. "Зберегти як чернетку" → `createDraft()`

### Suggest → Accept

1. `useSuggestSlots.mutate()` → ghost-блоки появляются
2. Accept одного → `createEntry.mutate()`, удаляется из `suggestions[]`
3. "Accept All" → `batchCreate.mutate(suggestions[])`
4. Ghost-блоки можно двигать и ресайзить до принятия

### Collect

1. Sidebar кнопка ClipboardCheck (если `collectable > 0`)
2. `collectTasks.mutate({procedureId, entries, externalEntries})`
3. Блоки получают `st-collected`, sidebar показывает `isCollected=true`

---

## 17. Edge cases и важные детали

1. **weekDates() дублируется в 3 местах:** `calendar-shared.ts`, `weekly-suggest-strategies.ts`, `calendar-entries.ts` (tech-debt).

2. **Перемещение между неделями:** не поддерживается (только текущая неделя).

3. **Блокировка collected-записей:** `updateEntry()` выбрасывает ошибку если `daily_task_id IS NOT NULL` + time update. UI не рендерит кнопки удаления/resize если `readOnly`.

4. **Каскадный push при смене времени:** перемещение synced-записи → старый event УДАЛЯЕТСЯ → `needs_push=true` → новый event при Push.

5. **Пересечение месяцев:** `getActivePlansForUser()` корректно запрашивает оба месяца.

6. **Template dedup:** case-insensitive по trim().

7. **LWW для external:** Pull сравнивает `lastModifiedDateTime` с `updated_at`. Наши данные новее → пропуск.

8. **has_transcript backfill:** при каждом Pull проверяются до 20 прошлых online-совещаний без транскрипта.

9. **ical_uid:** при первом meeting info fetch записывается в `weekly_calendar_entries.ical_uid` → cross-user кэш.

10. **weeklyCapacity = 32 хардкод:** `PlannerStats.tsx` — не берётся из `user_profiles.work_rate`.

---

## 18. Таблицы БД

| Таблица | Назначение |
|---------|-----------|
| `weekly_calendar_entries` | Все записи календаря |
| `calendar_sync_state` | delta_token + last_synced_at |
| `meeting_cache` | Cross-user кэш совещаний по ical_uid |
| `procedure_task_templates` | Шаблоны задач по процедурам |
| `planned_absences` | Отпуска (блокируют создание записей) |
| `monthly_plan_assignees` | Привязка пользователей к планам |
| `user_profiles.lunch_start` | Время обеда (HH:MM) |

---

## 19. API эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| GET/POST/PATCH/DELETE | `/api/planner/entries` | CRUD calendar entries |
| POST | `/api/planner/entries/suggest` | Suggest ghost-блоков |
| POST | `/api/planner/entries/collect` | Collect → daily_tasks |
| POST | `/api/planner/entries/copy` | Копирование записей |
| PATCH | `/api/planner/entries/lunch` | Настройка обеда |
| GET/POST | `/api/planner/tasks` | Task picker + create task |
| PATCH/DELETE | `/api/planner/tasks/[id]` | Изменение/удаление задачи |
| GET/POST/PATCH/DELETE | `/api/planner/templates` | CRUD шаблонов |
| POST | `/api/planner/templates/generate` | AI-генерация шаблона |
| GET/POST/PATCH/DELETE | `/api/planner/drafts` | CRUD черновиков |
| POST | `/api/planner/drafts/assign` | Назначение черновика в план |
| POST | `/api/planner/meetings/info` | Информация о совещании |
| POST | `/api/planner/meetings/summary` | AI-резюме транскрипта |
| POST | `/api/planner/sync/pull` | Pull из Outlook |
| POST | `/api/planner/sync/push` | Push в Outlook |

---

## 20. Файлы модуля

### Backend (lib/ops/planner/)
- `calendar-entries.ts` — типы, read-запросы
- `calendar-entries-write.ts` — create/update/delete, блокировки
- `calendar-shared.ts` — утилиты времени, weekDates
- `calendar-sync.ts` — оркестратор Pull
- `calendar-sync-reconcile.ts` — reconcile логика (LWW, @removed)
- `calendar-sync-backfill.ts` — backfill subjects + transcripts
- `calendar-push.ts` — Push через Graph $batch
- `calendar-push-helpers.ts` — buildOutlookEvent, ensureMasterCategory
- `weekly-suggest.ts` — оркестратор suggest
- `weekly-suggest-strategies.ts` — Strategy 1/2, findFreeSlot
- `collect-tasks.ts` — grouping → daily_tasks
- `drafts.ts` — draft CRUD + assign
- `task-service.ts` — task CRUD
- `task-validation.ts` — валидация задач
- `task-templates.ts` — CRUD шаблонов
- `meeting-details.ts` — fetch meeting info
- `meeting-summary.ts` — AI-саммари

### Hooks
- `usePlanner.ts` — entries, create/update/delete, collect, link
- `usePlannerSync.ts` — pull/push
- `usePlannerDrafts.ts` — drafts CRUD + assign
- `usePlannerTasks.ts` — tasks, status change, picker
- `useTaskTemplates.ts` — templates CRUD

### UI
- `PlannerContent.tsx` — главный, state, DnD
- `PlannerGrid.tsx` — сетка, droppable cells
- `PlannerBlocks.tsx` — entryStatus, CalendarBlock, GhostBlock, resize
- `PlannerSidebar.tsx` — процедуры, drag, collect
- `PlannerToolbar.tsx` — навигация, pull/push кнопки
- `PlannerFilters.tsx` — фильтры
- `PlannerStats.tsx` — статистика недели
- `TasksPanel.tsx` — панель задач
- `PlannerTasksDetail.tsx` — детали задач
- `TasksModal.tsx` — модалка задач
- `TaskPickerDropdown.tsx` — выбор шаблона/задачи
- `AddTaskModal.tsx` — создание задачи
- `TaskTemplatePicker.tsx` — AI-шаблоны
- `CompanyDistributionSelector.tsx` — распределение компаний
- `CalendarMeetingModal.tsx` — совещание с AI-саммари
- `TaskSuggestions.tsx` — AI-подсказки
- `TaskFileUpload.tsx` — загрузка файлов
- `planner-helpers.ts` — resolveOverlaps, computeOverlapLayout, утилиты
