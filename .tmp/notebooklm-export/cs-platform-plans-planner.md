

# ===== FILE: PLANS-BUSINESS-LOGIC.md =====

# Модуль "Планирование" (Plans) — Бизнес-логика

> Полное описание бизнес-логики, UI-флоу и взаимодействий модуля планирования.
> Дата аудита: 2026-03-23

---

## 1. Общая архитектура

### Иерархия объектов

```
annual_plans (годовой)
  └── quarterly_plans (квартальный, привязан к отделу + процессу)
        └── monthly_plans (месячный, привязан к процедуре)
              └── daily_tasks (задачи)
```

### Таблицы БД

| Таблица | Назначение |
|---|---|
| `annual_plans` | Годовые планы, `user_id` = автор |
| `quarterly_plans` | Квартальные: `annual_plan_id`, `department_id`, `process_id` |
| `monthly_plans` | Месячные: `quarterly_id`, `procedure_id`, `distribution_type` |
| `monthly_plan_assignees` | M:M — месячный план ↔ исполнители |
| `monthly_plan_companies` | M:M — месячный план ↔ компании |
| `monthly_plan_projects` | M:M — месячный план ↔ проекты |
| `monthly_plan_documents` | M:M — месячный план ↔ KB документы |
| `daily_tasks` | Задачи: `user_id`, `created_by`, `source`, `task_type` |
| `daily_task_companies` | M:M — задача ↔ компании (для учёта часов) |
| `v_monthly_plan_hours` | View: агрегирует `total_spent_hours`, `tasks_count` по плану |
| `v_annual_plans` | View для годовых планов с user_id |

### Слои кода

```
UI (components/dashboard/plans/)
  → Hooks (hooks/planning/, hooks/usePlans*.ts)
    → Services (lib/ops/plans/)
      → Supabase DB (direct client calls из hooks)
```

> **Важно:** Plans-модуль исторически использует прямые вызовы Supabase из hooks,
> а НЕ через API routes (кроме `/api/plans/count`). Это отклонение от стандартного паттерна.

---

## 2. Lifecycle плана — статусы и переходы

### 2.1. Годовой и квартальный план (7 статусов)

```
draft → submitted → approved → active → completed
                 ↘ returned → submitted (повтор)
                                        active → failed
```

Матрица переходов (`lib/ops/plans/status.ts:6-24`):

| Из | В | Кто может |
|---|---|---|
| `draft` | `submitted` | head |
| `submitted` | `approved` | chief |
| `submitted` | `returned` | chief |
| `approved` | `active` | head |
| `returned` | `submitted` | head |
| `active` | `completed` | chief |
| `active` | `failed` | chief |
| `completed` | — | никто (терминальный) |
| `failed` | — | никто (терминальный) |

**Реализация:** `changeAnnualPlanStatus()` / `changeQuarterlyPlanStatus()` в `status.ts` —
делают SELECT текущего статуса, проверяют допустимость перехода, затем UPDATE + `log_activity` RPC.

### 2.2. Месячный план (4 статуса, упрощённый)

```
draft ↔ active → completed
              → failed
completed → active (переоткрыть)
failed → active (переоткрыть)
```

| Из | В | Кто может |
|---|---|---|
| `draft` | `active` | head, chief |
| `active` | `draft` | head, chief |
| `active` | `completed` | head, chief |
| `active` | `failed` | head, chief |
| `completed` | `active` | head, chief |
| `failed` | `active` | head, chief |

**Особенность:** `changeMonthlyPlanStatus()` НЕ делает SELECT текущего статуса
(принимает `currentStatus` как параметр — обход RLS).

### 2.3. UI статус-дроппер

`PlanStatusDropdown` (`details/components/PlanStatusDropdown.tsx`) — показывает только
допустимые переходы из `useAvailableStatuses`. Блокируется в режиме редактирования формы.

---

## 3. Иерархия планов — как связаны

### Годовой план

- Создаётся через RPC `manage_annual_plan`
- Поля: `year`, `goal`, `expected_result`, `budget`, `status`, `user_id`
- Владелец — единственный автор (`annual_plans.user_id`)
- В деталях показывает связанные кварталы с прогресс-баром
- Прогресс: completed=100%, active=50%, approved=25%

### Квартальный план

- Создаётся через RPC `manage_quarterly_plan`
- Поля: `annual_plan_id`, `department_id`, `quarter` (1-4), `goal`, `expected_result`, `status`, `process_id`
- Связан с **процессом** (`processes` таблица) — ключевой фильтр для процедур в месячных
- Head видит только планы своего `department_id`

### Месячный план

- Создаётся через `manageMonthlyPlan()` (`write.ts:55`)
- Поля: `quarterly_id`, `procedure_id`, `year`, `month`, `planned_hours`, `distribution_type`, `status`, `created_by`
- **Уникальность:** `(quarterly_id, procedure_id, year, month)` — защита от дублей в `write.ts:76-89`
- Исполнители — таблица `monthly_plan_assignees` (удаляется/перезаписывается целиком при save)
- Компании — таблица `monthly_plan_companies`
- Проекты — таблица `monthly_plan_projects`
- KB документы — таблица `monthly_plan_documents`

### Связь процесс → процедура

Квартальный план привязан к **процессу**. Месячный план — к **процедуре** (которая принадлежит процессу).
При создании месячного плана доступны только процедуры из процесса квартального плана.
Уже использованные процедуры в том же квартале/месяце фильтруются из списка.

---

## 4. Задачи (daily_tasks)

### Поля задачи

| Поле | Тип | Назначение |
|---|---|---|
| `daily_task_id` | UUID | PK |
| `monthly_plan_id` | UUID FK | Привязка к плану (NULL = черновик) |
| `user_id` | UUID FK | Исполнитель |
| `created_by` | UUID FK | Кто создал (если chief/head за сотрудника) |
| `source` | string | `manual`, `template`, `manager`, `calendar`, `chief`, `head` |
| `task_type` | string | `completed`, `incomplete`, `draft` |
| `completed_at` | timestamp | Заполняется при `spent_hours > 0` |
| `description` | text | Основное описание (обязательное) |
| `title` | text | Короткий заголовок (необязательный) |
| `spent_hours` | numeric | Фактические часы |
| `task_date` | date | Дата выполнения |
| `attachment_url` | text | URL вложения (SharePoint) |
| `document_number` | text | Номер акта/заявки |
| `project_id` | UUID FK | Связанный проект |
| `kb_document_id` | UUID FK | Связанный KB документ |
| `distribution_type` | string | Тип распределения (копируется с плана) |

### Логика task_type

- `spent_hours > 0` → `task_type = 'completed'`, `completed_at = now()`
- `spent_hours == 0` → `task_type = 'incomplete'`, `completed_at = null`
- `task_type = 'draft'` — устанавливается через Reject flow

### Недельный лимит

**40 часов/неделя.** Проверяется в `AddTaskModal` через `getWeeklyTasksSpentHours()`.
Кнопка Save блокируется при превышении.

### RAG auto-save

При создании задачи с `description.length >= 10` И наличии `procedure_id` →
fire-and-forget POST на `/api/ai/embeddings`. Цель — накопление базы описаний для AI-подсказок.

---

## 5. Роли — матрица прав

| Действие | employee | analyst | head | chief |
|---|---|---|---|---|
| Видит годовые планы | Нет | Нет | Через quarterly→dept | Все |
| Видит квартальные | Свой dept | Свой dept | Свой dept | Все |
| Видит месячные | Только assigned | Только assigned | Все в dept | Все |
| Создаёт годовой | Нет | Нет | Нет | Да |
| Создаёт квартальный | Нет | Нет | Да | Да |
| Создаёт месячный | Нет | Нет | Да | Да |
| Редактирует план | Нет | Нет | Да | Да |
| Удаляет план | Нет | Нет | Только свои | Все |
| Submit (draft→submitted) | Нет | Нет | Да | Нет |
| Approve / Return | Нет | Нет | Нет | Да |
| Launch (approved→active) | Нет | Нет | Да | Нет |
| Complete / Fail | Нет | Нет | Нет | Да |
| Месячные статусы | Нет | Нет | Да | Да |
| Задача в свой план | Да | Да | Да | Да |
| Задача за другого | Нет | Нет | Да (свой dept) | Да |

**Важно:** `analyst` обрабатывается как `employee` в матрице статусов (normalizeRole).

---

## 6. Accept/Reject флоу задач

### Кто создаёт "чужие" задачи

Chief или Head добавляют задачу другому сотруднику через `+` в `PlanWorkLog` рядом с именем.
При этом:
1. `source` автоматически ставится `'chief'` или `'head'`
2. Бейдж в UI: фиолетовый **CHIEF** или бирюзовый **HEAD**

### Условие показа кнопок Accept/Reject

```
canAcceptReject = isChiefTask &&
                  task.task_type !== 'completed' &&
                  (user.role === 'chief' ||
                   (user.role === 'head' && task.source === 'head'))
```

Head может Reject только задачи, созданные Head'ом. Chief может всё.

### Действия

- **Accept:** `task_type = 'completed'`, `completed_at = now()`
- **Reject:** `task_type = 'draft'`, `completed_at = null`

---

## 7. Копирование плана

### 7.1. Копирование месячного плана

**Что копируется:**
- `procedure_id`, `planned_hours`, `description`, `distribution_type`
- `assignees`, `company_ids`, `project_ids`
- Статус нового плана — всегда `draft`

**Что НЕ копируется:** задачи, KB документы, фактические часы

**Ограничения:**
- Только в активный квартальный план (`status = 'active'`)
- Фильтрует кварталы по `process_id`
- Telegram-уведомление при создании (fire-and-forget)

### 7.2. Копирование квартального плана

**Что копируется:** `goal`, `expected_result`, `process_id`, `department_id`, статус = `draft`

**Защита от дублей:** проверяет `(annual_id, quarter, department_id)` перед INSERT

**Что НЕ копируется:** месячные планы, задачи

---

## 8. Распределение часов по компаниям

### Типы распределения

- `even` — поровну между выбранными компаниями
- `by_servers` — пропорционально количеству серверов
- `by_workstations` — пропорционально количеству рабочих станций

### На уровне плана

Поле `monthly_plans.distribution_type`. Данные инфраструктуры из `company_infrastructure`
по `(period_year, period_month)`. Если нет — fallback на `v_companies_with_infrastructure`.

Формула: `values[i].val / totalValues * 100` (округляется до целых %).

### На уровне задачи

Каждая задача имеет `daily_task_companies` (M:M). При создании задачи показывается
`CompanyDistributionSelector` с чипами компаний из плана. Пользователь может
отключить отдельные компании для конкретной задачи.

View `v_plan_user_company_hours` агрегирует часы по задачам с учётом компаний.

---

## 9. UI Flow

### 9.1. Главный экран (`PlansContent.tsx`)

- **TwoPanelLayout:** левая панель (дерево планов) + правая панель (детали)
- Employee: `refreshPlans(currentYear)` — всё для текущего года
- Head/chief: `fetchAnnualPlans()` → `fetchQuarterlyPlans(year)` → `fetchMonthlyPlans(quarter)`

### 9.2. Навигация (`usePlanNavigation.ts`)

Автоматический выбор: текущий год → текущий квартал → текущий месяц.
При смене года — сброс квартала, при смене квартала — сброс месяца.

### 9.3. Годовой план (`AnnualPlanDetails.tsx`)

- Автор с аватаром-инициалами
- Список кварталов: `ExpandableListItem` с прогресс-баром
- Бюджет: отдельное поле при создании, `StatBox` для существующих

### 9.4. Квартальный план (`QuarterlyPlanDetails.tsx`)

- Карточка связанного годового плана
- Статистика из `v_monthly_plan_hours` (хук `useQuarterlyMonthStats`)
- Список месячных с accordion

### 9.5. Месячный план (`MonthlyPlanDetails.tsx`)

Самый сложный компонент. Два хука:
- `useMonthlyPlanData` — загрузка (компании, пользователи, процедуры, задачи, права)
- `useMonthlyPlanHandlers` — действия (save, delete, status, task ops)

**Режимы:**
- `isNewPlan (id === 'new')` → сразу edit mode, нет Delete/Copy
- `isEditing = true` → форма редактирования
- `isEditing = false` → `PlanWorkLog` с задачами

**Выбор квартала:** только `approved` и `active` кварталы.
**Процедуры:** по `process_id` квартала, использованные фильтруются.

---

## 10. Уведомления Telegram

- Создание плана: `POST /api/telegram/notify/plan-created`
- Обновление: только если добавились новые исполнители
- Копирование: то же уведомление

---

## 11. Bot adapter

Два инструмента (`bot-adapter.ts`):

- **`get_plans`** — список месячных планов за месяц/год. Только `active` и `completed`. Scopes: `own`, `department`, `all`.
- **`get_hours`** — часы за месяц. Scopes: `own` (по процессам), `department/all` (по сотрудникам + процессам). RPC `get_task_hours_by_plan_user`.

---

## 12. API эндпоинты

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/plans/count` | Подсчёт планов текущего пользователя (annual, quarterly, monthly) |

Остальные операции (CRUD) — прямые вызовы Supabase из hooks (исторически).

---

## 13. Edge cases и особенности

1. **Новый план в state:** хранится как объект с `*_id = 'new'`. Все компоненты проверяют `isNewPlan = (id === 'new')`.

2. **Два массива monthly:** `monthlyPlans` (полный, для деталей) и `roleFilteredMonthlyPlans` (для списка). QuarterlyPlanDetails требует все планы.

3. **Синхронизация selectedPlan:** `useEffect` в `PlansContent.tsx:135-147` обновляет выбранный план после `refreshPlans`.

4. **Fallback процедур:** `getProcedures()` сначала из таблицы `procedures`, затем fallback на `v_kpi_operational`.

5. **Уникальность процедур:** `(quarterly_id, procedure_id, year, month)` — ошибка при дубле.

6. **normalizeRole дублируется:** в `useMonthlyPlanHandlers.ts:26-29` и `usePlanOperations.ts:19-22`. Analyst → employee.

7. **Удаление плана — ручной каскад:** `delete.ts:170-207` вручную удаляет tasks, assignees, companies, projects (не через FK CASCADE).

8. **Task shims:** `lib/ops/tasks/task-service.ts` и `hooks/useTaskOps.ts` — re-export из `lib/ops/planner/task-service`. Помечены `TODO: Remove in Phase 7`.

---

## 14. Файлы модуля

### Backend
- `lib/ops/plans/service-core.ts` — re-export index
- `lib/ops/plans/types.ts` — интерфейсы параметров
- `lib/ops/plans/read.ts` — чтение планов и задач
- `lib/ops/plans/write.ts` — запись (manage*)
- `lib/ops/plans/delete.ts` — удаление с проверкой прав
- `lib/ops/plans/status.ts` — матрицы переходов статусов
- `lib/ops/plans/plan-mappers.ts` — маппинг строк БД
- `lib/ops/plans/monthly-mappers.ts` — buildProceduresMap, buildHoursMapFromView
- `lib/ops/plans/quarterly-mappers.ts` — mapQuarterlyRows
- `lib/ops/plans/quarterly-fetcher.ts` — fetchQuarterlyPlansByAnnualIds
- `lib/ops/plans/monthly-plan-helpers.ts` — updateMonthlyPlanProjects/Companies
- `lib/ops/plans/plan-factories.ts` — createNew*Plan
- `lib/ops/plans/planning-utils.ts` — STATUS_CONFIG, getStatusShortText, цвета
- `lib/ops/plans/bot-adapter.ts` — getPlansTool, getHoursTool

### Hooks
- `hooks/usePlans.ts` — центральный state
- `hooks/usePlanOperations.ts` — save/remove/changeStatus
- `hooks/usePlanCopy.ts` — копирование месячного
- `hooks/planning/usePlanFilters.ts` — фильтрация
- `hooks/planning/usePlanNavigation.ts` — автовыбор
- `hooks/planning/useMonthlyPlanData.ts` — данные для MonthlyPlanDetails
- `hooks/planning/useMonthlyPlanHandlers.ts` — обработчики
- `hooks/planning/useQuarterlyMonthStats.ts` — статистика
- `hooks/planning/useQuarterlyPlanCopy.ts` — копирование квартального

### UI
- `plans/PlansContent.tsx` — корневой компонент
- `plans/PlanDetailsPanel.tsx` — router Annual/Quarterly/Monthly
- `plans/PlanTreeContent.tsx` — дерево планов (левая панель)
- `plans/PlanTileCard.tsx` — карточка плана
- `plans/tree/PlanTreeHeader.tsx` — тулбар навигации
- `plans/details/AnnualPlanDetails.tsx`
- `plans/details/QuarterlyPlanDetails.tsx`
- `plans/details/MonthlyPlanDetails.tsx`
- `plans/details/components/PlanStatusDropdown.tsx`
- `plans/details/components/PlanWorkLog.tsx` — задачи с Accept/Reject
- `plans/details/components/PlanCompanySection.tsx` — компании + часы
- `plans/details/components/PlanProcedureSection.tsx` — выбор процедуры
- `plans/details/components/PlanCopyModal.tsx`
- `plans/details/components/QuarterlyPlanCopyModal.tsx`
- `plans/details/components/QuarterlyMonthlyPlansList.tsx`
- `plans/Tasks/AddTaskModal.tsx` — создание/редактирование задачи
- `plans/Tasks/CompanyDistributionSelector.tsx`
- `plans/Tasks/TaskFileUpload.tsx`
- `plans/Tasks/TaskTemplatePicker.tsx`
- `plans/Tasks/TaskSuggestions.tsx`


# ===== FILE: PLANNER-BUSINESS-LOGIC.md =====

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
        → Supabase DB + Microsoft Graph API
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


# ===== FILE: plans-v2-matrix.md =====

# Plans V2 — Матрица панелей

> Як будуються три панелі залежно від фільтрів (scope) та вибору в сайдбарі.
> Оновлено: 2026-03-27

## Фільтри

- **Рік** — квартал і місяць не вибрані
- **Квартал** — квартал вибраний, місяць ні
- **Місяць** — місяць вибраний (квартал автоматично)

Місяці завжди видимі (3 шт з поточного або вибраного кварталу). Статус-фільтри прибрані.

---

## Середня панель

| Scope | Нічого | Процесс | Процедура |
|-------|--------|---------|-----------|
| **Рік** | AnnualListView | ProcessDetailView | ProcedureDetailPanel |
| **Квартал** | QuarterlyListView | ProcessDetailView | ProcedureDetailPanel |
| **Місяць** | MonthlyPlansListView | ProcessDetailView | ProcedureDetailPanel |

---

## Права панель

| Scope | Нічого | Процесс / Процедура |
|-------|--------|---------------------|
| **Рік** | EmptyState | EmployeeTasksPanel |
| **Квартал** | EmptyState | EmployeeTasksPanel |
| **Місяць** | MonthlyUsersView | EmployeeTasksPanel |

---

## Статуси планів

| DB value | Укр | Колір | Іконка (lucide) |
|----------|-----|-------|-----------------|
| — (немає плану) | Немає плану | gray | `Ban` |
| `pending` | Не затверджено | amber | `Hourglass` |
| `active` | В роботі | indigo | `Zap` |
| `done` | Виконано | green | `CheckCheck` |

Флоу: немає → створити → `pending` → затвердити → `active` → прийняти → `done`

---

## Кнопки дій

### Списки (AnnualListView, QuarterlyListView, MonthlyPlansListView)

| Статус | Plus (+) | Copy | Check (✓) | X (✗) chief only |
|--------|----------|------|-----------|-------------------|
| Немає плану | створити порожній | копіювати з попереднього | — | — |
| `pending` | — | — | → `active` | видалити план |
| `active` | — | — | → `done` | → `pending` |
| `done` | — | — | disabled | → `active` |

Копіювання:
- Рік: копіює expected_result + бюджетні статті з попереднього року
- Квартал: копіює expected_result + note + ініціативи з попереднього кварталу
- Місяць: копіює години, опис, distribution_type, компанії, проєкти, документи, виконавців

### Іконки дій

| Дія | Іконка | Колір |
|-----|--------|-------|
| Створити | `Plus` | green |
| Копіювати | `Copy` | indigo |
| Затвердити/Прийняти | `Check` | green |
| Відхилити/Повернути/Видалити | `X` | red |
| Редагувати | `Pencil` | indigo |
| Видалити | `Trash2` | red |

---

## ProcessDetailView — наборний по scope

Один компонент, секції з'являються залежно від рівня.

| Секція | Рік | Квартал | Місяць |
|--------|:---:|:-------:|:------:|
| Опис + Місія + Результат | ✓ | ✓ | ✓ |
| Бюджет (фільтр по даті scope) | весь рік | дати в Q | дати в M |
| Примітки | — | ✓ | ✓ |
| Ініціативи | — | ✓ | ✓ (active) |
| Процедури → задачі | — | — | ✓ |

Режим редагування: кнопка Pencil в хедері → розблокує додавання/видалення бюджету, редагування приміток, додавання/видалення ініціатив.

Кнопка Approve (панель внизу): показується тільки для canEdit коли статус `pending`.

---

## ProcedureDetailPanel — наборний по scope

| Секція | Рік | Квартал | Місяць |
|--------|:---:|:-------:|:------:|
| Опис + ціль (години/період) | ✓ | ✓ | ✓ |
| Послуга (serviceName) | ✓ | ✓ | ✓ |
| Компанії + метод розподілу | — | — | ✓ |
| Шаблони задач (title + content) | — | — | ✓ |
| Проєкти (зведені з місячних планів) | ✓ | ✓ | ✓ |
| Документи БЗ (зведені) | ✓ | ✓ | ✓ |
| Ініціативи | — | ✓ (всі) | ✓ (active) |
| Квартали → місяці (розгортаються) | ✓ | — | — |
| Місяці (план/факт/%) | — | ✓ | — |
| Футер (план/факт/%) | ✓ | ✓ | ✓ |

Порядок секцій: опис → послуга → компанії(M) → шаблони(M) → проєкти → документи → ініціативи(Q+M) → статистика(Y/Q) → футер

---

## MonthlyPlansListView (Місяць + нічого)

Процеси-аккордеони → процедури зі статусом + кнопки дій.
Показує `N/M` (планів/процедур) для кожного процесу.

---

## EmployeeTasksPanel (права панель)

| Вибір | Що показує при розгортанні |
|-------|---------------------------|
| Процесс (без процедури) | Процедури з годинами |
| Процедура | Задачі: назва + опис (2 рядки), source badge, години. Групування по назві + source |

---

## API Endpoints

| Endpoint | Methods | Опис |
|----------|---------|------|
| `/api/plans/annual` | POST, PATCH, DELETE | Річні плани: створити/копіювати, оновити, видалити |
| `/api/plans/quarterly` | POST, PATCH, DELETE | Квартальні плани: створити/копіювати, оновити, видалити |
| `/api/plans/monthly` | POST, DELETE | Місячні плани: створити/копіювати, видалити |
| `/api/plans/status` | PATCH | Універсальна зміна статусу (monthly/annual/quarterly) |
| `/api/plans/annual/budget` | POST, DELETE | Бюджетні статті річного плану |
| `/api/plans/quarterly/initiatives` | POST, PATCH, DELETE | Ініціативи квартального плану |

---

## Файли компонентів

```
src/components/dashboard/plans/v2/
├── PlansV2Content.tsx          — головний layout, 3 панелі, фільтри, маршрутизація
├── ProcessListPanel.tsx        — ліва панель (дерево процесів/процедур, аккордеон, іконки статусів)
├── ProcessDetailView.tsx       — середня: процесс (наборний Y/Q/M, edit mode)
├── ProcedureDetailPanel.tsx    — середня: процедура (наборний Y/Q/M) + ProcessView
├── AnnualViews.tsx             — AnnualListView + AnnualDetailView (legacy)
├── QuarterlyViews.tsx          — QuarterlyListView + QuarterlyDetailView (legacy)
├── MonthlyOverviewView.tsx     — MonthlyPlansListView + MonthlyCompaniesView + MonthlyUsersView
├── MonthlyProcessView.tsx      — (deprecated, замінений ProcessDetailView)
├── EmployeeTasksPanel.tsx      — права панель (співробітники + задачі)
└── demo-status-icons.html      — демо іконок статусів (public/)
```

Хуки:
```
src/hooks/
├── usePlansV2.ts               — навігація, дані, фільтри, бюджет, ініціативи, monthly overview
└── usePlansV2Detail.ts         — деталі: assignees, companies, projects, kbDocs, dailyTasks
```

API:
```
src/app/api/plans/
├── annual/route.ts             — POST/PATCH/DELETE річних планів
├── annual/budget/route.ts      — POST/DELETE бюджетних статей
├── quarterly/route.ts          — POST/PATCH/DELETE квартальних планів
├── quarterly/initiatives/route.ts — POST/PATCH/DELETE ініціатив
├── monthly/route.ts            — POST/DELETE місячних планів
├── status/route.ts             — PATCH статусу будь-якого плану
└── count/route.ts              — GET кількості планів
```

---

## Міграція БД (виконана 2026-03-26)

- `plan_status` enum: `pending`, `active`, `done` (замість 7 старих)
- `quarterly_plans.goal` → nullable
- `annual_plans.goal`, `expected_result` → nullable
- Views `v_annual_plans`, `v_plan_user_company_hours` перестворені
- Старі функції `get_plans_for_week`, `manage_annual_plan` видалені (V1)


# ===== FILE: plans-v2-spec.md =====

# Plans V2 — Техническое задание

> Статус: ЧЕРНОВИК, обсуждение
> Дата: 2026-03-26

## 1. Концепция

Модуль "Планы V2" — иерархическая навигация по планированию в разрезе процессов.
Процессы статичны и всегда присутствуют. Планы строятся автоматически на основе процессов.

### Иерархия планирования
```
Процес (mission, description)
  └── Річний план (expected_result, бюджетні статті)
        └── Квартальний план (expected_result, ініціативи)
              └── Місячний план (процедури, години, виконавці)
```

---

## 2. Структура БД — целевая

### 2.1. `processes` (миграция)

Добавить поля:
| Поле | Тип | Описание |
|------|-----|----------|
| `mission` | text | Постоянная миссия/цель процесса |
| `description` | text | Описание процесса |

> Миграция: перенести `annual_plans.goal` → `processes.mission` (по связке через quarterly_plans.process_id → annual_plan_id)

### 2.2. `budget_categories` (новая таблица)

Справочник категорий бюджета (фиксированный).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `name` | text NOT NULL | Название категории |
| `sort_order` | integer | Порядок отображения |

Начальные данные:
1. Ліцензії / ІТ-системи
2. Відрядження
3. Навчання
4. Проєкти / ініціативи
5. Інше

### 2.3. `budget_items` (новая таблица)

Справочник бюджетных статей.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `name` | text NOT NULL | "Ліцензія Microsoft 365 E3" |
| `category_id` | uuid FK → budget_categories | Категория |
| `process_id` | uuid FK → processes | К какому процессу относится |
| `description` | text | Описание |
| `is_active` | boolean DEFAULT true | Вкл/выкл |
| `created_at` | timestamptz | |

### 2.4. `annual_plans` (миграция — только добавляем)

Один годовой план = один процесс.

| Поле | Тип | Описание |
|------|-----|----------|
| `annual_id` | uuid PK | существует |
| `year` | integer NOT NULL | существует |
| `process_id` | uuid FK → processes | **НОВОЕ** — процесс |
| `expected_result` | text | существует |
| `status` | text NOT NULL DEFAULT 'draft' | существует (`plan_status` enum → оставляем) |
| `created_at` | timestamptz | **НОВОЕ** |
| `updated_at` | timestamptz | **НОВОЕ** |
| `user_id` | uuid | **DEPRECATED** — не удаляем, V2 не использует |
| `goal` | text | **DEPRECATED** — данные мигрированы в processes.mission |
| `budget` | numeric | **DEPRECATED** — считается SUM из annual_plan_budget |

Уникальность: `(year, process_id)` — один план на процесс в год.

### 2.5. `annual_plan_budget` (новая таблица)

Бюджетные статьи в годовом плане. Стоимость фиксируется на конкретный год.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `annual_plan_id` | uuid FK → annual_plans ON DELETE CASCADE | |
| `budget_item_id` | uuid FK → budget_items | Статья из справочника |
| `amount` | numeric(15,2) NOT NULL | Сумма на этот год |
| `payment_date` | date | Когда платить |
| `reminder_date` | date | Когда напомнить |

Уникальность: `(annual_plan_id, budget_item_id)` — одна статья один раз в плане.

### 2.6. `quarterly_plans` (миграция — только добавляем)

| Поле | Тип | Описание |
|------|-----|----------|
| `quarterly_id` | uuid PK | существует |
| `year` | integer NOT NULL | **НОВОЕ** |
| `quarter` | integer NOT NULL CHECK (1..4) | существует |
| `process_id` | uuid FK → processes | существует |
| `expected_result` | text | существует |
| `status` | text NOT NULL DEFAULT 'draft' | существует (`plan_status` enum → оставляем) |
| `note` | text | существует |
| `created_at` | timestamptz | **НОВОЕ** |
| `updated_at` | timestamptz | **НОВОЕ** |
| `annual_plan_id` | uuid FK | **DEPRECATED** — V2 связывает через process_id + year |
| `department_id` | uuid FK | **DEPRECATED** — V2 берёт из processes.department_id |
| `goal` | text | **DEPRECATED** — миссия в processes.mission |

Уникальность: `(year, quarter, process_id)`

### 2.7. `quarterly_plan_initiatives` (новая таблица)

Инициативы/активности на квартал (произвольные).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | uuid PK | |
| `quarterly_plan_id` | uuid FK → quarterly_plans ON DELETE CASCADE | |
| `title` | text NOT NULL | "Пілот системи X" |
| `description` | text | Детали |
| `status` | text DEFAULT 'planned' | `planned` / `in_progress` / `completed` |

### 2.8. `monthly_plans` (без изменений)

Текущая структура сохраняется. Связь с квартальным через `quarterly_id`.

> Проверить: `quarterly_id` FK после миграции quarterly_plans должен остаться рабочим.

---

## 3. Схема связей

```
processes
  ├── mission, description
  ├── budget_items[] (справочник статей процесса)
  │
  ├── annual_plans (year, process_id) UNIQUE
  │     ├── expected_result, status (draft/approved)
  │     └── annual_plan_budget[]
  │           ├── budget_item_id → budget_items
  │           ├── amount (сумма на этот год)
  │           ├── payment_date
  │           └── reminder_date
  │
  ├── quarterly_plans (year, quarter, process_id) UNIQUE
  │     ├── expected_result, status (draft/approved)
  │     ├── note
  │     └── quarterly_plan_initiatives[]
  │           ├── title, description
  │           └── status (planned/in_progress/completed)
  │
  └── [через процедуры]
        └── monthly_plans (quarterly_id, procedure_id, year, month) UNIQUE
              ├── planned_hours, status, distribution_type
              ├── monthly_plan_assignees[]
              ├── monthly_plan_companies[]
              ├── monthly_plan_projects[]
              ├── monthly_plan_documents[]
              └── daily_tasks[]
```

---

## 4. UI — Три панели

### 4.1. Левая панель (всегда видна)

Статический список всех процессов с вложенными процедурами.
- Процессы и процедуры НЕ исчезают при смене фильтров
- Прогресс (часы факт/план, %) пересчитывается по scope
- Клик на процесс → выбирает процесс
- Клик на процедуру → выбирает процедуру (только при месячном scope)

### 4.2. Средняя панель (6 состояний)

| Scope | Выбрано | Вид | Содержимое |
|-------|---------|-----|------------|
| Год | — | AnnualListView | Карточки годовых планов по процессам: mission, expected_result, бюджет (сумма), статус |
| Год | процесс | AnnualDetailView | Детали: mission, expected_result, статус, бюджетные статьи (таблица: статья, категория, сумма, дата оплаты, напоминание) |
| Квартал | — | QuarterlyListView | Карточки квартальных планов: процесс, expected_result, инициативы (кол-во), статус |
| Квартал | процесс | QuarterlyDetailView | Детали: expected_result, инициативы (список с статусами), note |
| Месяц | — | MonthlyListView | Список месячных планов: процедура, часы план/факт, статус, исполнители |
| Месяц | процесс | MonthlyProcessView | Процедуры процесса за месяц: часы, прогресс, исполнители |
| Месяц | процедура | MonthlyProcedureView | Детали месячного плана: справочник процедуры, компании, проекты, документы БЗ, исполнители |

### 4.3. Правая панель

Сотрудники — как сейчас. Показывает данные в контексте текущего выбора.

---

## 5. Автосоздание планов

### 5.1. Годовой план

**Триггер:** Выбран год, у процесса нет годового плана → в средней панели кнопка "Створити річний план".

**Первый раз (нет прошлогоднего):**
- Создаёт `annual_plans` с `process_id`, `year`
- `expected_result` ← `processes.mission` (копия, можно редактировать)
- Статус `draft`
- Бюджетные статьи — пустые, добавлять вручную

**Следующие годы (есть прошлогодний):**
- Копирует `expected_result` из прошлого года
- Копирует бюджетные статьи (budget_item_id + amount)
- Статьи помечены "потрібне підтвердження" — нужно ревью
- Статус `draft`

**Утверждение:** Шеф проверяет статьи, удаляет ненужные → статус `approved`.

### 5.2. Квартальный план

**Триггер:** Выбран квартал, у процесса нет квартального плана → кнопка "Створити квартальний план".

**Первый раз:**
- `expected_result` ← `processes.mission`
- Инициативы — пустые
- Статус `draft`

**Следующие годы:**
- Копирует из того же квартала прошлого года
- `expected_result` + инициативы (со статусом `planned`)
- Статус `draft`

**Утверждение:** Шеф ревьюит → `approved`.

### 5.3. Месячный план

Текущий функционал сохраняется (проверить).

---

## 6. Миграция данных

> **ПРИНЦИП: только добавляем поля, НЕ удаляем.**
> Старые поля остаются, помечены DEPRECATED. Удаление — после запуска V2.

### Шаг 1: processes
- ALTER TABLE `processes` ADD COLUMN `mission` text;
- ALTER TABLE `processes` ADD COLUMN `description` text;
- Заполнить `mission` из `annual_plans.goal` через quarterly_plans.process_id

### Шаг 2: annual_plans
- ALTER TABLE ADD COLUMN `process_id` uuid REFERENCES processes;
- ALTER TABLE ADD COLUMN `created_at` timestamptz DEFAULT now();
- ALTER TABLE ADD COLUMN `updated_at` timestamptz DEFAULT now();
- Заполнить `process_id` из quarterly_plans (через annual_plan_id)
- ADD UNIQUE (year, process_id)
- **НЕ удаляем:** `user_id`, `goal`, `budget` — остаются как deprecated

### Шаг 3: quarterly_plans
- ALTER TABLE ADD COLUMN `year` integer;
- ALTER TABLE ADD COLUMN `created_at` timestamptz DEFAULT now();
- ALTER TABLE ADD COLUMN `updated_at` timestamptz DEFAULT now();
- Заполнить `year` из annual_plans.year (через annual_plan_id)
- ALTER TABLE ALTER COLUMN `year` SET NOT NULL;
- ADD UNIQUE (year, quarter, process_id)
- **НЕ удаляем:** `annual_plan_id`, `department_id`, `goal` — остаются как deprecated

### Шаг 4: новые таблицы
- Создать `budget_categories` + seed данные
- Создать `budget_items` + индексы на FK (category_id, process_id)
- Создать `annual_plan_budget` + UNIQUE(annual_plan_id, budget_item_id) + индексы FK + ON DELETE CASCADE
- Создать `quarterly_plan_initiatives` + индекс FK + ON DELETE CASCADE

### Шаг 5: перенос бюджетов
- `annual_plans.budget` → создать записи в `annual_plan_budget` (категория "Інше", вся сумма)

### Шаг 6: проверки
- FK `monthly_plans.quarterly_id` → quarterly_plans — не затронут, работает
- Все существующие запросы V1 продолжают работать (поля не удалены)

---

## 7. Очистка после запуска V2 (TODO)

> Выполнять ТОЛЬКО после полного запуска V2 и проверки.

### annual_plans — удалить:
- `user_id` — автор определяется через process → department → head
- `goal` — мигрировано в processes.mission
- `budget` — считается SUM(annual_plan_budget.amount)

### quarterly_plans — удалить:
- `annual_plan_id` — связь через process_id + year
- `department_id` — берётся из processes.department_id
- `goal` — мигрировано в processes.mission

### Код — обновить:
- 10+ мест используют `quarterly_plans.department_id` → переписать на JOIN processes
- Запросы через `quarterly_plans.annual_plan_id` → переписать на process_id + year
- Удалить view `v_annual_plans` → создать новую с process info

---

## 8. Индексы (новые таблицы)

| Таблица | Индекс |
|---------|--------|
| `budget_items` | `category_id`, `process_id` |
| `annual_plan_budget` | `annual_plan_id`, `budget_item_id` |
| `quarterly_plan_initiatives` | `quarterly_plan_id` |
| `annual_plans` | `process_id` (новый) |

---

## 9. Открытые вопросы

1. ~~Тип даты для квартала~~ → `year` integer + `quarter` integer
2. Месячный план — нужна ли проверка функционала?
3. Напоминания (reminder_date) — через бота, email, UI?
4. RLS — кто видит чьи планы? Сейчас open policy.
5. Инициативы — нужен ли справочник или всегда произвольные?
6. Status enum — `plan_status` enum сейчас: какие значения? Нужен ли `approved` в нём?
