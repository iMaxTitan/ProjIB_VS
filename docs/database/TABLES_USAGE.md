# Использование таблиц и представлений (view) в БД

> Последнее обновление: 2026-03-03

Документ отражает фактическое использование объектов БД в `src/`
(по запросам Supabase `.from(...)`).

## Планирование

| Объект | Тип | Где используется |
|---|---|---|
| `annual_plans` | table | модули планов, сервисы отчетов |
| `quarterly_plans` | table | модули планов, сервисы отчетов |
| `monthly_plans` | table | UI планов, отчеты, задачи |
| `daily_tasks` | table | UI/сервисы задач, планы, отчеты |
| `daily_task_companies` | table | привязка компаний к задачам, отчеты |
| `monthly_plan_assignees` | table | UI/модули планов |
| `monthly_plan_companies` | table | UI/модули планов, отчеты |
| `monthly_plan_projects` | table | привязка проектов к планам |

## Справочники

| Объект | Тип | Где используется |
|---|---|---|
| `departments` | table | отчеты, сотрудники, справочники |
| `processes` | table | справочники, KB категории |
| `services` | table | модули планов |
| `procedures` | table | планы, KPI, эталоны AI |
| `companies` | table | инфраструктура, отчеты |
| `company_infrastructure` | table | инфраструктурные сервисы, отчеты |
| `user_profiles` | table | авторизация, профиль, активность, отчеты, бот |
| `projects` | table | CRUD в `useProjects`, привязка к задачам |
| `project_departments` | table | M:N связи в `useProjects` |

## Календарь и табель

| Объект | Тип | Где используется |
|---|---|---|
| `monthly_working_days` | table | производственный календарь, KPI расчёт |
| `employee_timesheet` | table | табель сотрудников, KPI, отчеты |

## AI и эталоны

| Объект | Тип | Где используется |
|---|---|---|
| `ai_reference_examples` | table | эталоны описаний задач и примечаний, UI справочника |
| `company_report_notes` | table | AI-примечания для отчетов по компаниям |

## Бот-платформа

| Объект | Тип | Где используется |
|---|---|---|
| `bot_permissions` | table | настройки прав инструментов по ролям |
| `telegram_notification_settings` | table | глобальные настройки уведомлений |
| `activities` | table | activity feed, API отчетов |

## Knowledge Base

| Объект | Тип | Где используется |
|---|---|---|
| `kb_categories` | table | категоризация KB документов, UI |
| `kb_documents` | table | индексация, управление документами, UI |
| `kb_chunks` | table | vector search, hybrid search |
| `kb_query_log` | table | аналитика запросов, triage |

## Представления (view)

| Объект | Описание | Где используется |
|---|---|---|
| `v_activity_feed` | UNION: activities + daily_tasks | activity-сервис |
| `v_user_details` | Профили + department_name/code | авторизация, сотрудники |
| `v_annual_plans` | Годовые планы + автор + quarterly_plans_count | модули планов |
| `v_monthly_plan_hours` | Агрегация часов: plan × total_spent_hours × tasks_count | KPI, планы |
| `v_kpi_current` | KPI метрики с entity_name, actual_value, target_value | KPI-контент |
| `v_kpi_operational` | KPI по procedures (plans_count, actual_value, total_hours) | планы, справочники |
| `v_kpi_process_agg` | Агрегация KPI по процессам | KPI |
| `v_projects_with_departments` | Проекты + массивы department_ids/names | хуки проектов |
| `v_companies_with_infrastructure` | Компании + last infrastructure record | инфраструктура |
| `v_plan_user_company_hours` | Task-level distributed hours: plan × user × company | отчеты |

Все views: `security_invoker = on`.
