# Схема базы данных (актуальная)

> Последнее обновление: 2026-02-11

Документ описывает текущую модель БД, используемую кодовой базой.

## Иерархия планирования

1. `annual_plans`
- PK: `annual_id`
- Основные поля: `department_id`, `goal`, `expected_result`, `status`, `created_by`

2. `quarterly_plans`
- PK: `quarterly_id`
- FK: `annual_plan_id` -> `annual_plans.annual_id` (в ряде сценариев связь опциональна)
- Основные поля: `department_id`, `process_id`, `quarter`, `goal`, `expected_result`, `status`, `created_by`

3. `monthly_plans`
- PK: `monthly_plan_id`
- FK: `quarterly_id` -> `quarterly_plans.quarterly_id` (опционально)
- Основные поля: `service_id`, `year`, `month`, `expected_result`, `status`, `created_by`

4. `daily_tasks`
- PK: `daily_task_id`
- FK: `monthly_plan_id` -> `monthly_plans.monthly_plan_id`
- Основные поля: `user_id`, `task_date`, `description`, `spent_hours`, `project_id`, `attachment_url`, `document_number`

## Связующие таблицы

- `monthly_plan_assignees`
  - Связь: месячный план <-> пользователь
  - Ключевые поля: `monthly_plan_id`, `user_id`

- `monthly_plan_companies`
  - Связь: месячный план <-> компания
  - Ключевые поля: `monthly_plan_id`, `company_id`

## Справочники и организационные таблицы

- `user_profiles`
- `departments`
- `processes`
- `services`
- `measures`
- `companies`
- `company_infrastructure`
- `activities`

## Модель проектов

- `projects`
  - PK: `project_id`
  - Поля: `project_name`, `description`, `is_active`, `created_by`, `created_at`, `updated_at`

- `project_departments`
  - M:N связь проектов и департаментов
  - Составной ключ: `project_id`, `department_id`

## Активные представления (view)

- `v_user_details`
- `v_annual_plans`
- `v_kpi_current`
- `v_kpi_operational`
- `v_projects_with_departments`
- `v_companies_with_infrastructure`
- `v_activity_feed`

## Ключевые миграции

- `20260206_add_projects.sql` — модель проектов и связей с департаментами
- `20260206_fix_projects_rls.sql` — корректировки RLS для проектов
- `20260209_remove_legacy_weekly_planning.sql` — удаление устаревших weekly-объектов
- `20260209_activity_feed_union_activities_daily_tasks.sql` — обновления activity feed
- `20260211_fix_rls_and_security_definer_views.sql` — усиление RLS и security-definer view

## Удаленная устаревшая weekly-модель

Удалено миграцией `20260209_remove_legacy_weekly_planning.sql`:

- Таблицы: `weekly_plans`, `weekly_tasks`, `weekly_plan_companies`
- Представление: `v_weekly_plans`
- Функции: weekly helper/reporting функции (`get_all_weekly_plans`, `get_active_weekly_plans_for_user`, `get_weekly_plans_with_assignees_hours` и др.)

В новом коде и документации weekly-сущности не использовать.



