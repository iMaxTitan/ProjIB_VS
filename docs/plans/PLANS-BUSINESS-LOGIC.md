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
      → PostgreSQL/PostgREST DB (direct client calls из hooks)
```

> **Важно:** Plans-модуль исторически использует прямые вызовы PostgreSQL/PostgREST из hooks,
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

Остальные операции (CRUD) — прямые вызовы PostgreSQL/PostgREST из hooks (исторически).

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
