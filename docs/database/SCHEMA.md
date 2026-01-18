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
