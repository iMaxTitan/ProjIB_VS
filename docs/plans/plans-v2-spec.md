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
