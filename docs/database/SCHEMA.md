# Структура базы данных Supabase

> Дата актуализации: 2026-02-06
>
> **ВАЖНО**: Система использует месячное планирование (monthly_plans → daily_tasks)

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

### services (Услуги)

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| service_id | string (uuid) | да | PK |
| process_id | string (uuid) |  | FK на processes |
| name | string (text) | да | Название услуги |
| description | string (text) |  | Описание |
| is_active | boolean | да | Активна ли услуга |
| created_at | string (timestamptz) |  | Дата создания |

### monthly_plans (Месячные планы) ⭐

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| monthly_plan_id | string (uuid) | да | PK |
| quarterly_id | string (uuid) |  | FK на quarterly_plans |
| service_id | string (uuid) |  | FK на services |
| year | integer | да | Год плана |
| month | integer | да | Месяц (1-12) |
| description | string (text) |  | Описание |
| status | string (plan_status) | да | Статус плана |
| planned_hours | number (numeric) | да | Плановые часы |
| distribution_type | string (text) |  | Тип распределения: ATBi7, ATBi5, etc. |
| created_by | string (uuid) |  | FK на user_profiles (создатель) |
| created_at | string (timestamptz) |  | Дата создания |

### daily_tasks (Ежедневные задачи) ⭐

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| daily_task_id | string (uuid) | да | PK |
| monthly_plan_id | string (uuid) | да | FK на monthly_plans |
| user_id | string (uuid) | да | FK на user_profiles |
| task_date | string (date) | да | Дата выполнения |
| description | string (text) | да | Описание задачи |
| spent_hours | number (numeric) | да | Затраченные часы |
| attachment_url | string (text) |  | URL вложения |
| document_number | string (text) |  | Номер документа (СЗ) |
| project_id | string (uuid) |  | FK на projects (опционально) |
| created_at | string (timestamptz) |  | Дата создания |

**Валидация:** Сумма часов пользователя за день ≤ 8 часов

### projects (Проекти - довідник) ⭐ NEW

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| project_id | string (uuid) | да | PK |
| project_name | string (varchar 255) | да | Назва проекту |
| description | string (text) |  | Опис |
| is_active | boolean | да | Чи активний (default true) |
| created_by | string (uuid) |  | FK на user_profiles |
| created_at | string (timestamptz) |  | Дата створення |
| updated_at | string (timestamptz) |  | Дата оновлення |

**Призначення:** Тег для групування задач по зовнішнім замовленням/проектам

### project_departments (Зв'язок проект ↔ департаменти) ⭐ NEW

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| project_id | string (uuid) | да | FK на projects |
| department_id | string (uuid) | да | FK на departments |
| created_at | string (timestamptz) |  | Дата створення |

**PK:** (project_id, department_id)
**Зв'язок:** M:N - один проект може бути прив'язаний до кількох департаментів

### monthly_plan_assignees (Исполнители)

| Поле | Тип | Обязательно |
|------|-----|-------------|
| monthly_plan_id | string (uuid) | да |
| user_id | string (uuid) | да |

**PK:** (monthly_plan_id, user_id)

### monthly_plan_companies (Предприятия)

| Поле | Тип | Обязательно |
|------|-----|-------------|
| monthly_plan_id | string (uuid) | да |
| company_id | string (uuid) | да |

**PK:** (monthly_plan_id, company_id)

### weekly_plans (Legacy - устаревшие)

> ⚠️ **УСТАРЕВШЕЕ**: Используйте monthly_plans

| Поле | Тип | Обязательно |
|------|-----|-------------|
| weekly_id | string (uuid) | да |
| quarterly_id | string (uuid) |  |
| expected_result | string (text) | да |
| planned_hours | number (numeric) |  |
| status | string (plan_status) | да |
| weekly_date | string (date) | да |

### weekly_tasks (Legacy - устаревшие)

> ⚠️ **УСТАРЕВШЕЕ**: Используйте daily_tasks

| Поле | Тип | Обязательно |
|------|-----|-------------|
| weekly_tasks_id | string (uuid) | да |
| weekly_plan_id | string (uuid) | да |
| user_id | string (uuid) | да |
| description | string (text) | да |
| spent_hours | number (numeric) | да |

### companies

| Поле | Тип | Обязательно |
|------|-----|-------------|
| company_id | string (uuid) | да |
| company_name | string (text) | да |

### company_infrastructure

Ежемесячные записи инфраструктуры предприятий (серверы, рабочие станции).

| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| infrastructure_id | string (uuid) | да | PK |
| company_id | string (uuid) | да | FK на companies |
| period_year | integer | да | Год записи |
| period_month | integer | да | Месяц записи (1-12) |
| servers_count | integer | да | Количество серверов |
| workstations_count | integer | да | Количество рабочих станций |
| notes | string (text) |  | Примечания |
| created_at | string (timestamptz) |  | Дата создания |
| created_by | string (uuid) |  | FK на user_profiles |

**Уникальный индекс:** (company_id, period_year, period_month)

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

### v_companies_with_infrastructure

Компании с актуальными данными инфраструктуры и процентами.

| Поле | Тип | Описание |
|------|-----|----------|
| company_id | string (uuid) | ID компании |
| company_name | string (text) | Название компании |
| infrastructure_id | string (uuid) | ID записи инфраструктуры |
| period_year | integer | Год записи |
| period_month | integer | Месяц записи |
| servers_count | integer | Количество серверов |
| workstations_count | integer | Количество рабочих станций |
| has_servers | boolean | Есть ли серверы |
| total_endpoints | integer | Общее количество единиц |
| total_servers | integer | Общее кол-во серверов (по всем компаниям) |
| total_workstations | integer | Общее кол-во РС (по всем компаниям) |
| workstations_percentage | numeric | Процент РС от общего |
| servers_percentage | numeric | Процент серверов от общего |
| history_records_count | integer | Количество записей истории |

### v_projects_with_departments ⭐ NEW

Проекти з агрегованими даними департаментів.

| Поле | Тип | Описание |
|------|-----|----------|
| project_id | string (uuid) | ID проекту |
| project_name | string (varchar) | Назва |
| description | string (text) | Опис |
| is_active | boolean | Активний |
| created_by | string (uuid) | Хто створив |
| created_at | string (timestamptz) | Дата створення |
| updated_at | string (timestamptz) | Дата оновлення |
| department_ids | array (uuid[]) | Масив ID департаментів |
| department_names | array (text[]) | Масив назв департаментів |

### v_activity_feed

Лента активности: выполненные задачи и созданные планы.

| Поле | Тип | Описание |
|------|-----|----------|
| activity_id | string (text) | Уникальный ID события |
| event_type | string (text) | Тип: 'task_completed', 'plan_created' |
| event_time | string (timestamp with time zone) | Время события |
| user_id | string (uuid) | ID пользователя |
| user_name | string (text) | ФИО пользователя |
| user_photo | string (text) | Фото в Base64 |
| user_role | string (text) | Роль пользователя |
| department_id | string (uuid) | ID отдела |
| department_name | string (text) | Название отдела |
| event_description | string (text) | Описание события |
| spent_hours | number (numeric) | Часы (для задач) или план. часы (для планов) |
| plan_id | string (uuid) | ID недельного плана |
| plan_name | string (text) | Название плана |
| plan_date | string (date) | Дата недели плана |
| quarterly_goal | string (text) | Цель квартального плана |
| quarter | integer (integer) | Квартал |
| process_name | string (text) | Название процесса ИБ |

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
**Валидация:** Проверяет, что сумма часов пользователя за указанную дату не превышает 8 часов.

| Параметр | Тип | Описание |
|----------|-----|----------|
| _weekly_tasks_id | uuid | ID задачи |
| _weekly_plan_id | uuid | ID недельного плана |
| _user_id | uuid | ID исполнителя (Supabase) |
| _description | text | Описание задачи |
| _spent_hours | numeric | Затраченные часы |
| _completed_at | date | Дата выполнения |
| _attachment_url | text | URL вложения |
| _document_number | text | Номер документа (СЗ) |

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

## Функции удаления планов (TypeScript)

> Реализованы в `src/lib/plans/plan-service.ts`

### canDeleteAnnualPlan / deleteAnnualPlan

Удаление годового плана.

**Проверки:**
- Только создатель (`user_id`) может удалить
- Нет связанных квартальных планов

```typescript
canDeleteAnnualPlan(annualId: string, userId: string): Promise<DeleteCheckResult>
deleteAnnualPlan(annualId: string, userId: string): Promise<{ success: boolean; error?: string }>
```

### canDeleteQuarterlyPlan / deleteQuarterlyPlan

Удаление квартального плана.

**Проверки:**
- Только создатель (`created_by`) может удалить
- Нет связанных месячных планов

```typescript
canDeleteQuarterlyPlan(quarterlyId: string, userId: string): Promise<DeleteCheckResult>
deleteQuarterlyPlan(quarterlyId: string, userId: string): Promise<{ success: boolean; error?: string }>
```

### canDeleteMonthlyPlan / deleteMonthlyPlan

Удаление месячного плана с каскадным удалением.

**Проверки:**
- Только создатель (`created_by`) может удалить

**Каскад:**
1. Удаляются задачи (`daily_tasks`)
2. Удаляются назначения (`monthly_plan_assignees`)
3. Удаляются связи с компаниями (`monthly_plan_companies`)
4. Удаляется сам план

```typescript
canDeleteMonthlyPlan(monthlyPlanId: string, userId: string): Promise<DeleteCheckResult>
deleteMonthlyPlan(monthlyPlanId: string, userId: string): Promise<{
  success: boolean;
  error?: string;
  deletedTasks?: number;
}>

interface DeleteCheckResult {
  canDelete: boolean;
  reason?: string;
  childCount?: number;
}
```

### get_activity_feed

Получение ленты активности с фильтрацией по ролям.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_user_id | uuid | ID текущего пользователя (определяет доступ) |
| p_department_id | uuid | Фильтр по отделу (опционально) |
| p_days_back | integer | Количество дней назад (по умолчанию 7) |
| p_limit | integer | Лимит записей (по умолчанию 50) |

**Логика доступа:**
- `chief` — видит активность всех сотрудников
- `head` — видит активность только своего отдела
- `employee` — видит только свою активность

**Возвращает:** Записи из `v_activity_feed` отсортированные по времени DESC.

### manage_company_infrastructure

CRUD операции для инфраструктуры предприятий.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_action | text | Действие: 'create', 'update', 'delete' |
| p_infrastructure_id | uuid | ID записи (для update/delete) |
| p_company_id | uuid | ID компании |
| p_period_year | integer | Год |
| p_period_month | integer | Месяц (1-12) |
| p_servers_count | integer | Количество серверов |
| p_workstations_count | integer | Количество рабочих станций |
| p_notes | text | Примечания |
| p_user_id | uuid | ID пользователя |

**Возвращает:** `{ infrastructure_id: uuid }`

### get_company_infrastructure_history

Получение истории инфраструктуры компании.

| Параметр | Тип | Описание |
|----------|-----|----------|
| p_company_id | uuid | ID компании |
| p_limit | integer | Лимит записей (по умолчанию 12) |

**Возвращает:** Таблица с полями: infrastructure_id, period_year, period_month, period_label, servers_count, workstations_count, total_endpoints, notes, created_at, created_by_name.

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
- `submitted` - На рассмотрении
- `approved` - Утвержден
- `active` - В работе
- `completed` - Выполнен
- `failed` - Не выполнен
- `returned` - Возвращен

### user_status
- `active` - Активный
- `blocked` - Заблокирован
- `pending` - Ожидает подтверждения

### kpi_category
- `department` - Отдел
- `user` - Пользователь
- `process` - Процесс

---

## Справочные данные

> Дата актуализации: 2026-01-17

### Отделы (departments)

| ID | Код | Название |
|----|-----|----------|
| `2c460943-e6d1-48e3-8300-7491ef2b37d8` | ИБ | УИБК |
| `36dab3d8-2c16-4c1c-ae8c-b62367482a7e` | ОКБ | ОКБ |
| `9beab000-39d0-4d7a-952d-242cef86d0f0` | СВК | СВК |
| `62f49b72-e9b2-481a-af87-3d459a8eba28` | СМУР | СМУР |

### Процессы (processes)

| # | ID | Название |
|---|-----|----------|
| 1 | `f5e88dfd-07e2-47e4-a4d8-52e166ada138` | Захист даних |
| 2 | `d131d36c-05ef-4e3c-a5dc-3e52eca89947` | Управління правами доступу |
| 3 | `693ef591-a165-49c1-a16e-26ec9cfed754` | Управління безпекою інформаційних систем |
| 4 | `535bbb05-2bcd-4884-b6f4-0610aec43db7` | Управління безпекою обчислювальних систем |
| 5 | `4dd284c2-5054-44b8-8e69-b7453a11eaf7` | Управління безпекою мережі |
| 6 | `24bd91ff-e239-4ced-8a76-568ffee96328` | Моніторинг та реагування на події та інциденти ІБ |
| 7 | `19e0c6a4-0a3a-49c2-a4ac-27fe93447ef6` | Управління ризиками інформаційної безпеки |
| 8 | `a684e4d7-3e9e-4dff-a46e-79b0400f2dda` | Навчання та підвищення обізнаності у сфері ІБ |
| 9 | `21a14ed2-1e15-407a-bae4-6d48a93bc42c` | Управління документацією СУІБ |
| 10 | `d6504c36-dc7a-4835-b477-ef366a13347b` | Безперервність інформаційної безпеки |
| 11 | `4bbb4e4c-6346-465f-8105-ff2b19043a98` | Управлінська та організаційна діяльність |

### Компании (companies)

| ID | Название |
|----|----------|
| `ffdbad51-be9b-470e-a9bb-1eff1c6596a2` | АТБ Енерго |
| `805be13b-5cc8-4084-ab0b-3c45ca6e89e6` | АТБ Маркет |
| `48a6e00b-ef2c-4d3e-bf58-e0d1be17f3c6` | Корпорація АТБ |
| `31d44859-64d5-4201-a36a-65d0e94e9cc8` | КФ Квітень |
| `5c54315a-e43d-45e6-892f-480c2e0e5d84` | Логістік Юніон |
| `d7129c09-dbb2-4da2-a6c4-f82b3fee298b` | МФ Фаворит |
| `a45d4458-aa01-4106-8202-675521854b21` | Рітейл Девелопмент |
| `6211ed9d-dc19-4026-ad1e-b049f2e3ee3d` | ЧП Транс Логистик |

### Сотрудники (user_profiles)

#### УИБК (ИБ)
| ID | ФИО | Email | Роль |
|----|-----|-------|------|
| `390773f1-cc3d-4ee7-842a-3e0eb82e7a8f` | Іванов Максим Володимирович | maxv@atbmarket.com | Шеф |

#### ОКБ
| ID | ФИО | Email | Роль | Статус |
|----|-----|-------|------|--------|
| `bb9a7893-c095-4392-aa96-e5a788c9a02c` | Казаков Володимир Сергійович | kazakovvs@atbmarket.com | Начальник | ✅ |
| `c25aea05-63ee-414b-9b50-c31815c2221e` | Василиненко Вячеслав Миколайович | Vasilinenko@atbmarket.com | Сотрудник | ✅ |
| `ef247c2d-bd70-44b8-bcce-2fc2a64c0dd0` | Венгер Артем Володимирович | VengerA@atbmarket.com | Сотрудник | ✅ |
| `b3a29f62-b41e-4010-ae72-bd47a4a2b74f` | Карчевський Юрій Анатолійович | Karchevskyi@atbmarket.com | Сотрудник | ✅ |
| `4140507f-00fb-4943-a4bb-cfdf0d2a5acc` | Мартинюк Сергій Іванович | MartynyukS@atbmarket.com | Сотрудник | ✅ |
| `0f5ceffa-3137-4d00-a84f-214aa67305a5` | Стопінський Роман Францішкович | Stopinskiy@atbmarket.com | Сотрудник | ✅ |
| `fb1a50ec-c120-42e9-84f0-aff028f7c9a5` | Федяй Віталій Леонідович | Fediai@atbmarket.com | Сотрудник | ✅ |
| `d026e474-cce7-4023-9ac8-b2d1090793db` | Шаферистов Павло Вікторович | shaferistov@atbmarket.com | Сотрудник | ✅ |
| `fc74ffb0-3589-48b8-a154-bd1038230a77` | Шленськовий Олексій Анатолійович | Shlenskovyi@atbmarket.com | Сотрудник | ✅ |
| `874b95c2-ffad-43bf-8fb8-efa989037ebf` | Андрійчук Андрій Анатолійович | AndriychukA@atbmarket.com | Сотрудник | 🚫 |

#### СВК
| ID | ФИО | Email | Роль | Статус |
|----|-----|-------|------|--------|
| `ba856d59-1b30-4bcb-8dcd-6821b97b0f1e` | Бондаренко Людмила Анатоліївна | bondarenkol@atbmarket.com | Начальник | ✅ |
| `4c63c960-7d05-4c09-9719-611f89a13c62` | Барановська Регіна Сергіївна | BaranovskaR@atbmarket.com | Сотрудник | ✅ |
| `a88667cf-db05-4a52-8f5c-1f16878c3393` | Лобань Юрій Сергійович | lobany@atbmarket.com | Сотрудник | ✅ |
| `3942dbf1-0740-4d44-8f08-23637b98cae2` | Чмух Роман Ігорович | Chmukh@atb.ua | Сотрудник | ✅ |

#### СМУР
| ID | ФИО | Email | Роль | Статус |
|----|-----|-------|------|--------|
| `add0bce6-2446-47ee-b5d4-d82c837941dc` | Денисов Костянтин Володимирович | denisovk@atbmarket.com | Начальник | ✅ |
| `d7063d6f-9845-46d7-94cd-d110ce5dd5e2` | Диковицький Петро Іванович | Dikovitskiy@atbmarket.com | Сотрудник | ✅ |
| `71bb49b1-5980-414a-8ef3-67e409485f0c` | Ігнатова Катерина Євгенівна | Ihnatova@atbmarket.com | Сотрудник | ✅ |
| `1c85eb0c-dd58-459b-91eb-c8bc516f3c1c` | Куник Сергій Сергійович | kuniks@atbmarket.com | Сотрудник | ✅ |
| `bd9faac0-9b72-4297-b159-f6d2a52a4aaa` | Сухоцька Руслана Вадимівна | Sukhotskaya@atbmarket.com | Сотрудник | ✅ |
| `865d9bb2-c054-405b-bc4e-8c74b9fb80f6` | Нікітіна Єлизавета Олександрівна | NikitinaEA@atbmarket.com | Сотрудник | 🚫 |

### Статистика справочников

| Справочник | Количество |
|------------|------------|
| Отделы | 4 |
| Процессы | 11 |
| Компании | 8 |
| Сотрудники | 21 (активных: 19, заблокированных: 2) |

## Логика отчётности

### Привязка задач к неделям

**Ключевой принцип:** Задача всегда привязана к неделе выполнения через `completed_at`, независимо от типа плана.

### Недельный отчёт

Группировка: **План → Задачи этой недели**

```
Неделя 13-19 января 2026
────────────────────────
📋 Впровадження SIEM [проект]
   ├─ Налаштування збору логів (8ч)
   └─ Тестування правил (4ч)

🔄 Управління доступами [процес]
   ├─ Надання доступу до SAP (2ч)
   └─ Аудит прав адмінів (3ч)
```

### Месячный/Квартальный отчёт

Группировка: **План упоминается один раз → Все задачи за период**

```
Квартал 1, 2026
────────────────────────
📋 Впровадження SIEM
   Період: 13.01 - 31.03.2026
   Всього: 54ч (18 задач)

   ├─ [Тиж 3] Налаштування збору логів — 8ч
   ├─ [Тиж 4] Інтеграція з AD — 12ч
   └─ ...

🔄 Управління доступами
   Всього за квартал: 156ч
```

### Подробнее

См. [docs/architecture/PLAN_TYPES.md](../architecture/PLAN_TYPES.md)
