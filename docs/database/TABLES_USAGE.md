# Использование таблиц и представлений (view) в БД

> Последнее обновление: 2026-02-11

Документ отражает фактическое использование объектов БД в `src/`
(по запросам Supabase `.from(...)`).

## Основные объекты планирования

| Объект | Тип | Статус использования | Где используется |
|---|---|---|---|
| `annual_plans` | table | активно | модули планов, сервисы отчетов |
| `quarterly_plans` | table | активно | модули планов, сервисы отчетов |
| `monthly_plans` | table | активно | UI планов, отчеты, задачи |
| `daily_tasks` | table | активно | UI/сервисы задач, модули планов, отчеты |
| `monthly_plan_assignees` | table | активно | UI/модули планов |
| `monthly_plan_companies` | table | активно | UI/модули планов, отчеты |

## Справочники и орг-объекты

| Объект | Тип | Статус использования | Где используется |
|---|---|---|---|
| `departments` | table | активно | отчеты, сотрудники, справочники |
| `processes` | table | активно | справочники, activity-сервисы |
| `services` | table | активно | модули планов |
| `measures` | table | активно | модули планов, activity-сервисы |
| `companies` | table | активно | инфраструктура, месячные отчеты |
| `company_infrastructure` | table | активно | инфраструктурные сервисы |
| `user_profiles` | table | активно | авторизация/профиль/активность/отчеты |
| `activities` | table | активно | activity feed, API отчетов |

## Проекты

| Объект | Тип | Статус использования | Где используется |
|---|---|---|---|
| `projects` | table | активно | CRUD в `useProjects` |
| `project_departments` | table | активно | M:N связи в `useProjects` |

## Представления (view)

| Объект | Тип | Статус использования | Где используется |
|---|---|---|---|
| `v_user_details` | view | активно | авторизация, сотрудники, планы |
| `v_annual_plans` | view | активно | модули чтения планов |
| `v_kpi_current` | view | активно | KPI-контент |
| `v_kpi_operational` | view | активно | планы/справочник показателей |
| `v_projects_with_departments` | view | активно | хуки проектов |
| `v_companies_with_infrastructure` | view | активно | инфраструктура/детали планов |
| `v_activity_feed` | view | активно | activity-сервис |

## Устаревшее weekly-планирование

Weekly-объекты удалены миграцией:

- `supabase/migrations/20260209_remove_legacy_weekly_planning.sql`

Не использовать и не документировать как активные:

- `weekly_plans`
- `weekly_tasks`
- `weekly_plan_*`
- `v_weekly_plans`
- устаревшие weekly RPC-функции





