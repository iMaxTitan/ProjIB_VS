# Структура базы данных Supabase

> Автоматически сгенерировано из OpenAPI схемы Supabase
> Дата: 2026-01-15

## Таблицы

### user_profiles

| Поле | Тип | Обязательно |
|------|-----|-------------|
| department_id | string (uuid) | да |
| email | string (text) | да |
| full_name | string (text) | да |
| photo_base64 | string (text) |  |
| role | string (text) | да |
| status | string (public.user_status) | да |
| user_id | string (uuid) | да |

### departments

| Поле | Тип | Обязательно |
|------|-----|-------------|
| created_at | string (timestamp with time zone) |  |
| department_code | string (text) | да |
| department_id | string (uuid) | да |
| department_name | string (text) | да |

### processes

| Поле | Тип | Обязательно |
|------|-----|-------------|
| process_id | string (uuid) | да |
| process_name | string (text) | да |

### annual_plans

| Поле | Тип | Обязательно |
|------|-----|-------------|
| annual_id | string (uuid) | да |
| budget | number (numeric) |  |
| expected_result | string (text) | да |
| goal | string (text) | да |
| status | string (public.plan_status) | да |
| user_id | string (uuid) |  |
| year | integer (integer) | да |

### quarterly_plans

| Поле | Тип | Обязательно |
|------|-----|-------------|
| annual_plan_id | string (uuid) |  |
| department_id | string (uuid) |  |
| expected_result | string (text) | да |
| goal | string (text) | да |
| process_id | string (uuid) |  |
| quarter | integer (integer) | да |
| quarterly_id | string (uuid) | да |
| status | string (public.plan_status) | да |

### weekly_plans

| Поле | Тип | Обязательно |
|------|-----|-------------|
| expected_result | string (text) | да |
| planned_hours | number (numeric) |  |
| quarterly_id | string (uuid) |  |
| status | string (public.plan_status) | да |
| weekly_date | string (date) | да |
| weekly_id | string (uuid) | да |

### weekly_tasks

| Поле | Тип | Обязательно |
|------|-----|-------------|
| attachment_url | string (text) |  |
| completed_at | string (timestamp without time zone) |  |
| description | string (text) | да |
| spent_hours | number (numeric) | да |
| user_id | string (uuid) | да |
| weekly_plan_id | string (uuid) | да |
| weekly_tasks_id | string (uuid) | да |

### weekly_plan_assignees

| Поле | Тип | Обязательно |
|------|-----|-------------|
| user_id | string (uuid) | да |
| weekly_plan_id | string (uuid) | да |

### weekly_plan_companies

| Поле | Тип | Обязательно |
|------|-----|-------------|
| company_id | string (uuid) | да |
| weekly_id | string (uuid) | да |

### companies

| Поле | Тип | Обязательно |
|------|-----|-------------|
| company_id | string (uuid) | да |
| company_name | string (text) | да |

### activities

| Поле | Тип | Обязательно |
|------|-----|-------------|
| action_type | string (text) | да |
| activity_id | string (uuid) | да |
| created_at | string (timestamp with time zone) |  |
| details | jsonb (jsonb) |  |
| target_id | string (uuid) | да |
| target_type | string (text) | да |
| user_id | string (uuid) | да |

### kpi_metrics

| Поле | Тип | Обязательно |
|------|-----|-------------|
| category | string (public.kpi_category) | да |
| created_at | string (timestamp with time zone) | да |
| description | string (text) |  |
| metric_id | string (uuid) | да |
| name | string (text) | да |
| target_value | number (numeric) | да |
| updated_at | string (timestamp with time zone) | да |

### kpi_entity_metrics

| Поле | Тип | Обязательно |
|------|-----|-------------|
| created_at | string (timestamp with time zone) | да |
| entity_id | string (uuid) | да |
| entity_metric_id | string (uuid) | да |
| entity_type | string (public.kpi_category) | да |
| metric_id | string (uuid) | да |
| target_value | number (numeric) |  |
| updated_at | string (timestamp with time zone) | да |

### kpi_values

| Поле | Тип | Обязательно |
|------|-----|-------------|
| actual_value | number (numeric) | да |
| comment | string (text) |  |
| created_at | string (timestamp with time zone) | да |
| entity_metric_id | string (uuid) | да |
| period_end | string (date) | да |
| period_start | string (date) | да |
| updated_at | string (timestamp with time zone) | да |
| value_id | string (uuid) | да |

## Views (Представления)

### v_user_details

| Поле | Тип |
|------|-----|
| department_code | string (text) |
| department_id | string (uuid) |
| department_name | string (text) |
| email | string (text) |
| full_name | string (text) |
| photo_base64 | string (text) |
| role | string (text) |
| status | string (public.user_status) |
| user_id | string (uuid) |

### v_annual_plans

| Поле | Тип |
|------|-----|
| annual_id | string (uuid) |
| author_email | string (text) |
| author_name | string (text) |
| author_photo | string (text) |
| budget | number (numeric) |
| completion_percentage | integer (integer) |
| expected_result | string (text) |
| goal | string (text) |
| quarterly_plans_count | integer (bigint) |
| status | string (public.plan_status) |
| user_id | string (uuid) |
| year | integer (integer) |

### v_quarterly_plans

| Поле | Тип |
|------|-----|
| annual_plan_id | string (uuid) |
| department_id | string (uuid) |
| department_name | string (text) |
| expected_result | string (text) |
| goal | string (text) |
| process_id | string (uuid) |
| process_name | string (text) |
| quarter | integer (integer) |
| quarterly_id | string (uuid) |
| status | string (public.plan_status) |
| weekly_plans_count | integer (bigint) |

### v_weekly_plans

| Поле | Тип |
|------|-----|
| annual_plan_id | string (uuid) |
| assignees_count | integer (bigint) |
| company_names | array (text[]) |
| department_id | string (uuid) |
| department_name | string (text) |
| expected_result | string (text) |
| planned_hours | number (numeric) |
| process_id | string (uuid) |
| process_name | string (text) |
| quarter | integer (integer) |
| quarterly_expected_result | string (text) |
| quarterly_goal | string (text) |
| quarterly_id | string (uuid) |
| quarterly_status | string (public.plan_status) |
| status | string (public.plan_status) |
| weekly_date | string (date) |
| weekly_id | string (uuid) |

### v_active_weekly_plans

| Поле | Тип |
|------|-----|
| assignees_count | integer (bigint) |
| assignees_info | array (jsonb[]) |
| company_names | array (text[]) |
| department_id | string (uuid) |
| department_name | string (text) |
| expected_result | string (text) |
| planned_hours | number (numeric) |
| process_id | string (uuid) |
| process_name | string (text) |
| quarterly_id | string (uuid) |
| status | string (public.plan_status) |
| tasks_info | array (jsonb[]) |
| weekly_date | string (date) |
| weekly_id | string (uuid) |

### v_quarterly_reports

| Поле | Тип |
|------|-----|
| active_weekly | integer (bigint) |
| annual_plan_id | string (uuid) |
| completed_weekly | integer (bigint) |
| completion_percentage | number (numeric) |
| department_id | string (uuid) |
| department_name | string (text) |
| expected_result | string (text) |
| failed_weekly | integer (bigint) |
| goal | string (text) |
| process_id | string (uuid) |
| process_name | string (text) |
| quarter | integer (integer) |
| quarterly_id | string (uuid) |
| status | string (public.plan_status) |
| total_weekly | integer (bigint) |
| weekly_plans_count | integer (bigint) |

### v_kpi_current

| Поле | Тип |
|------|-----|
| actual_value | number (numeric) |
| change_value | number (numeric) |
| entity_id | string (uuid) |
| entity_name | string (text) |
| entity_type | string (public.kpi_category) |
| metric_category | string (public.kpi_category) |
| metric_description | string (text) |
| metric_id | string (uuid) |
| metric_name | string (text) |
| period_end | string (date) |
| period_start | string (date) |
| target_value | number (numeric) |

## RPC Functions (Stored Procedures)

### manage_annual_plan

Управление годовыми планами (создание, обновление, удаление).

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_action | text | Действие: 'create', 'update', 'delete' |
| p_annual_id | uuid | ID плана (для update/delete) |
| p_user_id | uuid | ID пользователя (Supabase) |
| p_year | integer | Год |
| p_goal | text | Цель |
| p_expected_result | text | Ожидаемый результат |
| p_status | plan_status | Статус плана |
| p_budget | numeric | Бюджет |

### manage_quarterly_plan

Управление квартальными планами.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_action | text | Действие: 'create', 'update', 'delete' |
| p_quarterly_id | uuid | ID квартального плана |
| p_annual_plan_id | uuid | ID годового плана |
| p_user_id | uuid | ID пользователя (Supabase) |
| p_department_id | uuid | ID отдела |
| p_process_id | uuid | ID процесса |
| p_quarter | integer | Квартал (1-4) |
| p_goal | text | Цель |
| p_expected_result | text | Ожидаемый результат |
| p_status | text | Статус |

### manage_weekly_plan

Управление недельными планами.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_action | text | Действие: 'create', 'update', 'delete' |
| p_weekly_id | uuid | ID недельного плана |
| p_quarterly_id | uuid | ID квартального плана |
| p_user_id | uuid | ID пользователя (Supabase) |
| p_department_id | uuid | ID отдела |
| p_weekly_date | date | Дата недели |
| p_expected_result | text | Ожидаемый результат |
| p_planned_hours | numeric | Планируемые часы |
| p_status | text | Статус |
| p_assignees | uuid[] | Массив ID исполнителей |

### manage_weekly_task

Управление задачами недельных планов.

| Параметр | Тип | Описание |
|----------|-----|----------|
| _weekly_tasks_id | uuid | ID задачи |
| _weekly_plan_id | uuid | ID недельного плана |
| _user_id | uuid | ID исполнителя (Supabase) |
| _description | text | Описание задачи |
| _spent_hours | numeric | Затраченные часы |
| _completed_at | date | Дата выполнения |
| _attachment_url | text | URL вложения |

### upsert_user_profile

Создание или обновление профиля пользователя.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_email | text | Email (ключ связи с Azure AD) |
| p_full_name | text | Полное имя |
| p_role | text | Роль: 'chief', 'head', 'employee', 'admin' |
| p_status | user_status | Статус: 'active', 'blocked' и т.д. |
| p_department_id | uuid | ID отдела |
| p_photo_base64 | text | Фото в Base64 |

### upsert_employee

Создание или обновление сотрудника (устаревшая, использовать upsert_user_profile).

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_azure_id | uuid | Azure AD ID |
| p_email | varchar | Email |
| p_full_name | varchar | Полное имя |
| p_short_name | varchar | Короткое имя |
| p_role | varchar | Роль |
| p_department_id | uuid | ID отдела |
| p_created_by | uuid | Кто создал |

### get_plans_counts

Получение количества планов для пользователя.

| Параметр | Тип | Описание |
|----------|-----|----------|
| u_id | uuid | ID пользователя (Supabase) |

### get_all_annual_plans

Получение всех годовых планов для пользователя.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_user_id | uuid | ID пользователя (Supabase) |

### get_all_quarterly_plans

Получение квартальных планов.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_annual_plan_id | uuid | ID годового плана |
| p_user_id | uuid | ID пользователя (Supabase) |

### get_all_weekly_plans

Получение недельных планов.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_quarterly_plan_id | uuid | ID квартального плана |
| p_user_id | uuid | ID пользователя (Supabase) |

### get_active_weekly_plans_for_user

Получение активных недельных планов для пользователя.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_user_id | text | ID пользователя (Supabase) |

### get_weekly_plans_with_assignees_hours

Получение недельных планов с часами исполнителей.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_user_id | text | ID пользователя (Supabase) |

### log_activity

Логирование действий пользователя.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_user_id | uuid | ID пользователя (Supabase) |
| p_action_type | text | Тип действия |
| p_target_type | text | Тип объекта |
| p_target_id | uuid | ID объекта |
| p_details | jsonb | Детали в JSON |

### manage_kpi_metric

Управление метриками KPI.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_metric_id | uuid | ID метрики |
| p_name | text | Название |
| p_description | text | Описание |
| p_category | kpi_category | Категория |
| p_target_value | numeric | Целевое значение |

### manage_kpi_entity_metric

Привязка метрики KPI к сущности.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_entity_metric_id | uuid | ID связи |
| p_entity_id | uuid | ID сущности |
| p_entity_type | kpi_category | Тип сущности |
| p_metric_id | uuid | ID метрики |
| p_target_value | numeric | Целевое значение |

### manage_kpi_value

Управление значениями KPI.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_value_id | uuid | ID значения |
| p_entity_metric_id | uuid | ID связи метрики |
| p_period_start | date | Начало периода |
| p_period_end | date | Конец периода |
| p_actual_value | numeric | Фактическое значение |
| p_comment | text | Комментарий |

## Enum Types

### plan_status
- `draft` - Черновик
- `active` - Активный
- `completed` - Выполнен
- `failed` - Не выполнен

### user_status
- `active` - Активный
- `blocked` - Заблокирован
- `pending` - Ожидает подтверждения

### kpi_category
- `department` - Отдел
- `user` - Пользователь
- `process` - Процесс
