# Схема базы данных (актуальная)

> Последнее обновление: 2026-02-11
> Источник: live-запрос к Supabase (OpenAPI spec + SELECT count)

Документ описывает текущую модель БД, используемую кодовой базой.

---

## Статистика

| Таблица | Строк | Колонок |
|---------|------:|--------:|
| daily_tasks | 20 951 | 10 |
| monthly_plan_assignees | 634 | 3 |
| activities | 304 | 7 |
| project_departments | 187 | 3 |
| monthly_plans | 120 | 13 |
| company_infrastructure | 104 | 9 |
| measures | 96 | 10 |
| monthly_plan_companies | 93 | 3 |
| quarterly_plans | 61 | 8 |
| services | 49 | 6 |
| projects | 47 | 7 |
| annual_plans | 26 | 7 |
| user_profiles | 21 | 8 |
| processes | 13 | 4 |
| companies | 8 | 2 |
| departments | 4 | 4 |

---

## Иерархия планирования

```
annual_plans (год)
  └── quarterly_plans (квартал)
        └── monthly_plans (месяц)
              └── daily_tasks (задачи)
```

### 1. `annual_plans` — 26 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `annual_id` | uuid PK | |
| `year` | integer | Год плана |
| `goal` | text | Цель |
| `expected_result` | text | Ожидаемый результат |
| `budget` | numeric | Бюджет |
| `status` | text | active(12), completed(12), submitted(1), draft(1) |
| `user_id` | uuid | Автор плана |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### 2. `quarterly_plans` — 61 строка

| Колонка | Тип | Описание |
|---------|-----|----------|
| `quarterly_id` | uuid PK | |
| `department_id` | uuid FK → departments | |
| `annual_plan_id` | uuid FK → annual_plans | Опциональная связь |
| `quarter` | integer | 1-4 |
| `goal` | text | |
| `expected_result` | text | |
| `status` | text | active(47), completed(9), draft(3), approved(2) |
| `process_id` | uuid FK → processes | |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### 3. `monthly_plans` — 120 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `monthly_plan_id` | uuid PK | |
| `quarterly_id` | uuid FK → quarterly_plans | Опционально |
| `service_id` | uuid FK → services | |
| `year` | integer | |
| `month` | integer | |
| `title` | text | Название |
| `description` | text | |
| `status` | text | completed(97), active(18), draft(5) |
| `planned_hours` | numeric | |
| `created_by` | uuid FK → user_profiles | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `measure_id` | uuid FK → measures | |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### 4. `daily_tasks` — 20 951 строка

| Колонка | Тип | Описание |
|---------|-----|----------|
| `daily_task_id` | uuid PK | |
| `monthly_plan_id` | uuid FK → monthly_plans | |
| `user_id` | uuid FK → user_profiles | |
| `task_date` | date | Диапазон: 2024-02-28 — 2026-02-06 |
| `description` | text | |
| `spent_hours` | numeric | |
| `attachment_url` | text | |
| `document_number` | text | |
| `created_at` | timestamptz | |
| `project_id` | uuid FK → projects | |

RLS: ENABLED, Policy: permissive (authenticated + anon)

---

## Связующие таблицы (M:N)

### `monthly_plan_assignees` — 634 строки

| Колонка | Тип |
|---------|-----|
| `monthly_plan_id` | uuid FK → monthly_plans (PK) |
| `user_id` | uuid FK → user_profiles (PK) |
| `assigned_at` | timestamptz |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `monthly_plan_companies` — 93 строки

| Колонка | Тип |
|---------|-----|
| `monthly_plan_id` | uuid FK → monthly_plans (PK) |
| `company_id` | uuid FK → companies (PK) |
| `created_at` | timestamptz |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `project_departments` — 187 строк

| Колонка | Тип |
|---------|-----|
| `project_id` | uuid FK → projects (PK, ON DELETE CASCADE) |
| `department_id` | uuid FK → departments (PK, ON DELETE CASCADE) |
| `created_at` | timestamptz |

RLS: ENABLED, Policy: permissive (authenticated + anon)

---

## Справочники и организационные таблицы

### `user_profiles` — 21 строка

| Колонка | Тип | Описание |
|---------|-----|----------|
| `user_id` | uuid PK | |
| `email` | varchar | Корпоративная почта |
| `full_name` | varchar | ФИО |
| `photo_base64` | text | Фото в base64 |
| `role` | text | chief(1), head(3), employee(17) |
| `department_id` | uuid FK → departments | |
| `status` | text | active(19), blocked(2) |
| `last_seen_at` | timestamptz | Последняя активность |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `departments` — 4 строки

| department_name | department_code |
|----------------|-----------------|
| УИБК | ИБ |
| СВК | СВК |
| СМУР | СМУР |
| ОКБ | ОКБ |

Колонки: `department_id` (uuid PK), `department_name`, `department_code`, `created_at`

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `processes` — 13 строк

| Колонка | Тип |
|---------|-----|
| `process_id` | uuid PK |
| `process_name` | text |
| `department_id` | uuid FK → departments |
| `description` | text |

Распределение по департаментам: ОКБ(5), СМУР(4), СВК(4)

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `services` — 49 строк

| Колонка | Тип |
|---------|-----|
| `service_id` | uuid PK |
| `process_id` | uuid FK → processes |
| `name` | text |
| `description` | text |
| `is_active` | boolean |
| `created_at` | timestamptz |

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `measures` — 96 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `measure_id` | uuid PK | |
| `process_id` | uuid FK → processes | |
| `name` | text | |
| `description` | text | |
| `category` | text | process(53), operational(31), strategic(10), null(2) |
| `target_value` | integer | |
| `target_period` | text | year / quarter / month |
| `is_active` | boolean | active: 49 из 96 |
| `created_at` | timestamptz | |
| `created_by` | uuid FK → user_profiles | |

**RLS: НЕ ВКЛЮЧЕН** — таблица без RLS

### `companies` — 8 строк

| Колонка | Тип |
|---------|-----|
| `company_id` | uuid PK |
| `company_name` | text |

Компании: Корпорація АТБ, АТБ Маркет, АТБ Енерго, МФ Фаворит, ЧП Транс Логистик, Логістік Юніон, Рітейл Девелопмент, КФ Квітень

RLS: ENABLED, Policy: permissive (authenticated + anon)

### `company_infrastructure` — 104 строки

| Колонка | Тип |
|---------|-----|
| `infrastructure_id` | uuid PK |
| `company_id` | uuid FK → companies |
| `period_year` | integer |
| `period_month` | integer |
| `servers_count` | integer |
| `workstations_count` | integer |
| `notes` | text |
| `created_at` | timestamptz |
| `created_by` | uuid FK → user_profiles |

**RLS: НЕ ВКЛЮЧЕН** — таблица без RLS

### `activities` — 304 строки

| Колонка | Тип | Описание |
|---------|-----|----------|
| `activity_id` | uuid PK | |
| `user_id` | uuid FK → user_profiles | |
| `action_type` | text | create / update / delete |
| `target_type` | text | quarterly_plan / monthly_plan / annual_plan / ... |
| `target_id` | uuid | |
| `details` | jsonb | Снимок данных |
| `created_at` | timestamptz | |

**RLS: НЕ ВКЛЮЧЕН** — таблица без RLS

---

## Модель проектов

### `projects` — 47 строк (46 active)

| Колонка | Тип |
|---------|-----|
| `project_id` | uuid PK |
| `project_name` | text |
| `description` | text |
| `is_active` | boolean |
| `created_by` | uuid FK → user_profiles |
| `created_at` | timestamptz |
| `updated_at` | timestamptz (trigger) |

RLS: ENABLED, Policy: permissive (authenticated + anon)

---

## Представления (views) — 8 шт.

Все views: `security_invoker = on` (миграция 20260211)

| View | Строк | Описание |
|------|------:|----------|
| `v_activity_feed` | 21 255 | UNION: activities + daily_tasks |
| `v_kpi_operational` | 49 | KPI по measures (plans_count, actual_value, total_hours) |
| `v_kpi_current` | 49 | KPI метрики с entity_name, actual_value, target_value |
| `v_projects_with_departments` | 47 | Проекты + массивы department_ids/names |
| `v_annual_plans` | 26 | Годовые планы + автор + quarterly_plans_count |
| `v_user_details` | 21 | Профили + department_name/code |
| `v_kpi_process_agg` | 13 | Агрегация KPI по процессам |
| `v_companies_with_infrastructure` | 8 | Компании + last infrastructure record |

---

## RPC-функции — 22 шт.

### Планирование
| Функция | Параметры | Описание |
|---------|-----------|----------|
| `manage_annual_plan` | p_action, p_annual_id, p_budget, p_expected_result, p_goal, p_status, p_user_id, p_year | CRUD годовых планов |
| `manage_quarterly_plan` | p_action, p_annual_plan_id, p_department_id, p_expected_result, p_goal, p_process_id, p_quarter, p_quarterly_id, p_status, p_user_id | CRUD квартальных планов |
| `get_all_annual_plans` | p_user_id | Все годовые планы |
| `get_all_quarterly_plans` | p_annual_plan_id, p_user_id | Квартальные планы по году |
| `get_plans_counts` | u_id | Счётчики планов |
| `get_plans_for_week` | p_department_id, p_user_id, p_week_start | Планы на неделю |

### KPI и меры
| Функция | Параметры | Описание |
|---------|-----------|----------|
| `manage_measure` | p_action, p_category, p_description, p_measure_id, p_name, p_process_id, p_target_period, p_target_value, p_user_id | CRUD мер. **SECURITY DEFINER** |
| `manage_kpi_metric` | p_category, p_description, p_metric_id, p_name, p_target_value | CRUD KPI метрик |
| `manage_kpi_entity_metric` | p_entity_id, p_entity_metric_id, p_entity_type, p_metric_id, p_target_value | Привязка метрик к сущностям |
| `manage_kpi_value` | p_actual_value, p_comment, p_entity_metric_id, p_period_end, p_period_start, p_value_id | Ввод KPI значений |

### Инфраструктура и компании
| Функция | Параметры | Описание |
|---------|-----------|----------|
| `manage_company_infrastructure` | p_company_id, p_period_year, p_period_month, p_servers, p_workstations, ... | CRUD инфраструктуры |
| `get_company_infrastructure_history` | p_company_id, p_limit | История инфраструктуры |

### Отчёты
| Функция | Параметры | Описание |
|---------|-----------|----------|
| `get_company_report_data` | p_company_id, p_month, p_year | Данные для отчёта по компании |
| `get_employee_report_data` | p_month, p_user_id, p_year | Данные для отчёта по сотруднику |

### Активность
| Функция | Параметры | Описание |
|---------|-----------|----------|
| `get_activity_feed` | p_user_id, p_department_id, p_days_back, p_limit | Лента активности. **SECURITY DEFINER** |
| `log_activity` | p_user_id, p_action_type, p_target_type, p_target_id, p_details | Логирование |
| `log_user_action` | p_user_id, p_action_type, p_target_type, p_target_id, p_details | Логирование (alias) |

### Проекты и пользователи
| Функция | Параметры | Описание |
|---------|-----------|----------|
| `get_projects_for_user` | p_user_id | Проекты пользователя. **SECURITY DEFINER** |
| `upsert_employee` | p_azure_id, p_created_by, p_department_id, p_email, p_full_name, p_role, p_short_name | Upsert сотрудника |
| `upsert_user_profile` | p_department_id, p_email, p_full_name, p_photo_base64, p_role, p_status | Upsert профиля |

### Легаси (ссылаются на удалённые таблицы)
| Функция | Статус |
|---------|--------|
| `manage_weekly_plan` | Функция существует, но таблицы удалены. Вернёт ошибку при вызове |
| `manage_weekly_task` | Ошибка: `relation "weekly_tasks" does not exist` |

---

## Безопасность (RLS)

### Текущее состояние

| Таблица | RLS | Политика | ANON доступ |
|---------|-----|----------|-------------|
| annual_plans | ENABLED | permissive | READ+WRITE |
| quarterly_plans | ENABLED | permissive | READ+WRITE |
| monthly_plans | ENABLED | permissive | READ+WRITE |
| daily_tasks | ENABLED | permissive | READ+WRITE |
| monthly_plan_assignees | ENABLED | permissive | READ+WRITE |
| monthly_plan_companies | ENABLED | permissive | READ+WRITE |
| project_departments | ENABLED | permissive | READ+WRITE |
| user_profiles | ENABLED | permissive | READ+WRITE |
| departments | ENABLED | permissive | READ+WRITE |
| processes | ENABLED | permissive | READ+WRITE |
| services | ENABLED | permissive | READ+WRITE |
| companies | ENABLED | permissive | READ+WRITE |
| projects | ENABLED | permissive | READ+WRITE |
| **measures** | **DISABLED** | — | **READ+WRITE** |
| **company_infrastructure** | **DISABLED** | — | **READ+WRITE** |
| **activities** | **DISABLED** | — | **READ+WRITE** |

### Проблема

Все политики: `FOR ALL TO authenticated, anon USING (true) WITH CHECK (true)`.
Supabase-клиент использует `anon` key → все запросы идут как роль `anon`.
`auth.uid()` не работает (Azure AD, не Supabase Auth).

**Результат: любой с публичным anon key имеет полный доступ ко всем данным.**

### GRANT на RPC-функции

| Объект | anon | authenticated | service_role |
|--------|------|---------------|--------------|
| `get_activity_feed()` | GRANT | GRANT | — |
| `v_activity_feed` (SELECT) | GRANT | GRANT | — |
| `manage_measure()` | — | GRANT | GRANT |

---

## Ключевые миграции

| Файл | Описание |
|------|----------|
| `20260206_add_projects.sql` | Модель проектов + связь с департаментами |
| `20260206_fix_projects_rls.sql` | Корректировки RLS для проектов |
| `20260206_manage_measure.sql` | CRUD функция для мер (SECURITY DEFINER) |
| `20260206_import_projects.sql` | Импорт данных проектов |
| `20260209_remove_legacy_weekly_planning.sql` | Удаление weekly-таблиц (но функции остались!) |
| `20260209_fix_weekly_plan_companies_fk_cascade.sql` | CASCADE для FK |
| `20260209_fix_function_search_path.sql` | Фиксация search_path для всех функций |
| `20260209_add_missing_fk_indexes.sql` | Индексы на FK колонки |
| `20260209_rebuild_activity_feed_from_activities.sql` | Пересборка activity feed |
| `20260209_activity_feed_union_activities_daily_tasks.sql` | UNION activity feed |
| `20260211_fix_rls_and_security_definer_views.sql` | RLS enable + security_invoker views |

## Удалённая weekly-модель

Удалено миграцией `20260209_remove_legacy_weekly_planning.sql`:

- Таблицы: `weekly_plans`, `weekly_tasks`, `weekly_plan_companies`
- Представление: `v_weekly_plans`
- Функции: weekly helper/reporting функции

**Внимание:** RPC-функции `manage_weekly_plan` и `manage_weekly_task` остались в БД, хотя таблицы удалены. Требуется очистка (DROP FUNCTION).
