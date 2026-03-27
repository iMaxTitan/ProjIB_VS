# Схема базы данных (актуальная)

> Последнее обновление: 2026-03-03
> Источник: live-запрос к PostgreSQL

---

## Статистика

| Таблица | Строк | Описание |
|---------|------:|----------|
| daily_tasks | 21 587 | Ежедневные задачи |
| daily_task_companies | 7 825 | Привязка компаний к задачам (M:N) |
| monthly_plan_assignees | 739 | Исполнители планов (M:N) |
| monthly_plan_companies | 312 | Компании планов (M:N) |
| ai_reference_examples | 190 | AI-эталоны описаний |
| monthly_plans | 154 | Месячные планы |
| procedures | 88 | Процедуры/показатели |
| company_report_notes | 68 | AI-примечания к отчетам |
| kb_query_log | 65 | Лог KB запросов |
| employee_timesheet | 58 | Табель сотрудников |
| kb_chunks | 446 | Чанки KB документов |
| kb_documents | 29 | KB документы |
| user_profiles | 23 | Профили пользователей |
| bot_permissions | 22 | Права бот-инструментов |
| company_infrastructure | 13 | Инфраструктура компаний |
| kb_categories | 4 | Категории KB |
| departments | 4 | Департаменты |
| monthly_working_days | 3 | Производственный календарь |
| telegram_notification_settings | 2 | Настройки уведомлений |
| companies | 8 | Компании |
| quarterly_plans | ~61 | Квартальные планы |
| annual_plans | ~26 | Годовые планы |
| processes | 13 | Процессы |
| services | 49 | Услуги |
| projects | ~47 | Проекты |
| project_departments | ~187 | Проекты ↔ департаменты (M:N) |
| monthly_plan_projects | — | Проекты ↔ планы (M:N) |
| weekly_calendar_entries | — | Записи тижневого календаря (plan + external) |
| calendar_sync_state | — | Стан синхронізації з Outlook (delta token) |
| procedure_task_templates | — | Шаблони задач для процедур |
| planned_absences | — | Заплановані відсутності |
| monthly_plan_documents | — | Документи ІБ ↔ плани (M:N) |

| planned_absences | 0 | Заявки на отпуск |
| weekly_plan_slots | — | Тижневі слоти процедур (розклад) |

**Итого: 29 таблиц.** Все с RLS ENABLED, политика `TO authenticated`.

---

## Иерархия планирования

```
annual_plans (год)
  └── quarterly_plans (квартал)
        └── monthly_plans (месяц)
              └── daily_tasks (задачи)
                    └── daily_task_companies (M:N привязка компаний)
```

### `annual_plans`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `annual_id` | uuid PK | |
| `year` | integer | Год плана |
| `goal` | text | Цель |
| `expected_result` | text | Ожидаемый результат |
| `budget` | numeric | Бюджет |
| `status` | plan_status | draft, submitted, approved, active, completed, failed, returned |
| `user_id` | uuid | Автор плана |

### `quarterly_plans`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `quarterly_id` | uuid PK | |
| `department_id` | uuid FK → departments | |
| `annual_plan_id` | uuid FK → annual_plans | Опциональная связь |
| `quarter` | integer | 1-4 |
| `goal` | text | |
| `expected_result` | text | |
| `status` | plan_status | |
| `process_id` | uuid FK → processes | |
| `note` | text | Примечание |

### `monthly_plans` — 154 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `monthly_plan_id` | uuid PK | |
| `quarterly_id` | uuid FK → quarterly_plans | Опционально |
| `service_id` | uuid FK → services | |
| `year` | integer | |
| `month` | integer | 1-12 |
| `title` | text | Название |
| `description` | text | |
| `status` | text | draft, submitted, approved, returned, active, completed, failed |
| `planned_hours` | numeric | |
| `created_by` | uuid FK → user_profiles | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `procedure_id` | uuid FK → procedures | |
| `distribution_type` | text | by_servers, by_workstations, even (default: even) |

### `daily_tasks` — 21 587 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `daily_task_id` | uuid PK | |
| `monthly_plan_id` | uuid FK → monthly_plans | |
| `user_id` | uuid FK → user_profiles | |
| `task_date` | date | |
| `title` | text | Короткое название задачи |
| `description` | text | Подробности выполнения |
| `spent_hours` | numeric | 0–40 |
| `source` | text | manual, template, manager, calendar — откуда задача. См. ADR [25] |
| `task_type` | text | draft, incomplete, completed — состояние задачи. См. ADR [25] |
| `attachment_url` | text | SharePoint URL |
| `document_number` | text | Номер СЗ |
| `created_at` | timestamptz | |
| `project_id` | uuid FK → projects | Опционально |
| `distribution_type` | text | by_servers, by_workstations, even |

### `daily_task_companies` — 7 825 строк

| Колонка | Тип |
|---------|-----|
| `daily_task_id` | uuid FK → daily_tasks (PK) |
| `company_id` | uuid FK → companies (PK) |
| `created_at` | timestamptz |

Привязка компаний на уровне задачи (не плана). См. Decision [14].

---

## Связующие таблицы (M:N)

### `monthly_plan_assignees` — 739 строк

| `monthly_plan_id` | `user_id` | `assigned_at` |
|---|---|---|

### `monthly_plan_companies` — 312 строк

| `monthly_plan_id` | `company_id` | `created_at` |
|---|---|---|

### `monthly_plan_projects`

| `monthly_plan_id` | `project_id` | `created_at` |
|---|---|---|

### `project_departments`

| `project_id` (ON DELETE CASCADE) | `department_id` (ON DELETE CASCADE) | `created_at` |
|---|---|---|

---

## Справочники и организационные таблицы

### `user_profiles` — 23 строки

| Колонка | Тип | Описание |
|---------|-----|----------|
| `user_id` | uuid PK | |
| `email` | text | Корпоративная почта |
| `full_name` | text | ФИО |
| `role` | text | chief, head, employee |
| `department_id` | uuid FK → departments | |
| `status` | user_status | active, blocked |
| `position` | text | Должность |
| `work_rate` | numeric | 0.01–1.0 (ставка) |
| `photo_base64` | text | Фото |
| `last_seen_at` | timestamptz | |
| **Telegram** | | |
| `telegram_chat_id` | bigint (unique) | |
| `telegram_username` | text | |
| `telegram_is_active` | boolean | |
| `telegram_linked_at` | timestamptz | |
| `telegram_verify_code` | text | Код верификации |
| `telegram_verify_code_expires_at` | timestamptz | |
| `telegram_verify_code_attempts` | integer | |
| **Teams** | | |
| `teams_aad_oid` | text (unique) | Azure AD Object ID |
| `teams_conversation_id` | text | |
| `teams_service_url` | text | |
| `teams_is_active` | boolean | |
| `teams_linked_at` | timestamptz | |
| `teams_member_id` | text | |
| **AI / Notifications** | | |
| `ai_api_key_encrypted` | text | AES-256-GCM |
| `ai_provider` | text | openai, anthropic |
| `ai_model` | text | |
| `notification_channel` | text | telegram, teams, both |

### `departments` — 4 строки

УИБК (ИБ), СВК (СВК), СМУР (СМУР), ОКБ (ОКБ)

### `processes` — 13 строк

| `process_id` | `process_name` (unique) | `department_id` | `description` |
|---|---|---|---|

### `services` — 49 строк

| `service_id` | `process_id` FK | `name` | `description` | `is_active` | `created_at` |
|---|---|---|---|---|---|

### `procedures` — 88 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `procedure_id` | uuid PK | |
| `process_id` | uuid FK → processes | |
| `name` | text | |
| `description` | text | |
| `category` | text | strategic, process, operational |
| `target_value` | integer | Целевое количество за период |
| `target_period` | text | year, quarter, month |
| `is_active` | boolean | |
| `service_name` | text | Связанная услуга (текст) |
| `service_prompt` | text | AI-промпт для услуги |
| `created_by` | uuid FK → user_profiles | |
| `created_at` | timestamptz | |

### `companies` — 8 строк

| `company_id` | `company_name` | `company_full_name` | `director` | `contract_number` | `contract_date` | `rate_per_hour` |
|---|---|---|---|---|---|---|

### `company_infrastructure` — 13 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `infrastructure_id` | uuid PK | |
| `company_id` | uuid FK → companies | |
| `period_year` | integer | |
| `period_month` | integer | 1-12 |
| `servers_count` | integer | |
| `workstations_count` | integer | |
| `notes` | text | |
| `company_full_name` | text | Снапшот |
| `director` | text | Снапшот |
| `contract_number` | text | Снапшот |
| `rate_per_hour` | numeric | Снапшот |
| `contract_date` | date | Снапшот |
| `created_by` | uuid FK → user_profiles | |
| `created_at` | timestamptz | |

### `projects`

| `project_id` | `project_name` | `description` | `is_active` | `created_by` FK | `created_at` | `updated_at` (trigger) |
|---|---|---|---|---|---|---|

### `activities`

| `activity_id` | `user_id` FK | `action_type` (create/update/delete/view/assign/status_change) | `target_type` | `target_id` | `details` jsonb | `created_at` |
|---|---|---|---|---|---|---|

---

## Производственный календарь

### `monthly_working_days` — 3 строки

| Колонка | Тип | Описание |
|---------|-----|----------|
| `year` | integer (PK) | |
| `month` | integer (PK) | 1-12 |
| `work_hours` | integer | 0-248 |
| `day_types` | jsonb | Типы дней по числам месяца |
| `updated_by` | uuid FK → user_profiles | |
| `updated_at` | timestamptz | |

### `employee_timesheet` — 58 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `year` | integer | 2020-2100 |
| `month` | integer | 1-12 |
| `user_id` | uuid FK → user_profiles | |
| `days` | jsonb | Дни месяца с типами |
| `work_hours` | integer | Рабочие часы |
| `work_rate` | numeric | Снапшот ставки на момент записи |
| `created_by` | uuid FK | |
| `updated_by` | uuid FK | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

---

## Планирование отпусков

### `planned_absences`

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `user_id` | uuid FK → user_profiles | Сотрудник |
| `year` | integer | Год (из start_date, для фильтрации) |
| `month` | integer | 1-12 (месяц начала) |
| `days` | int[] | Рабочие дни месяца (1-based), для табеля |
| `absence_type` | text | '14d' или '5d' (КЗоТ: 14+5+5=24 к.д.) |
| `start_date` | date | Дата начала отпуска |
| `end_date` | date | Дата окончания (start + 14/5 - 1 к.д.) |
| `calendar_days` | int | 14 или 5 |
| `status` | text | pending, approved, rejected |
| `comment` | text | Комментарий сотрудника |
| `reject_reason` | text | Причина отказа |
| `approved_by` | uuid FK → user_profiles | Кто утвердил/отклонил |
| `approved_at` | timestamptz | Когда утвердили |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**Квота (валидация в сервисе):** max 1×14d + 2×5d = 24 к.д./год.
**Кросс-месяц:** если отпуск переходит на следующий месяц, approve записывает 'О' в оба табеля.
**Chief:** auto-approve при создании (сам себе утверждает).
**Workflow:** employee создает (pending) → head/chief approve → дни записываются в `employee_timesheet` кодом 'О'.

### ~~`weekly_plan_slots`~~ (REPLACED by `weekly_calendar_entries`)

Таблиця видалена. Дані перенесено в `weekly_calendar_entries` (див. нижче або ADR [27]).

### `weekly_calendar_entries` (Planner module)

Єдина таблиця для планових слотів та зовнішніх подій Outlook.

| Колонка | Тип | Опис |
|---------|-----|------|
| `id` | uuid PK | |
| `employee_id` | uuid FK → user_profiles | Співробітник |
| `procedure_id` | uuid FK → procedures | Процедура (для plan entries) |
| `monthly_plan_id` | uuid FK → monthly_plans | Зв'язок з планом |
| `daily_task_id` | uuid FK → daily_tasks | Зв'язок із задачею (після збору) |
| `task_template_id` | uuid FK → procedure_task_templates | Шаблон задачі (до збору) |
| `source` | text | `'plan'` або `'external'` |
| `date` | date | День тижня |
| `start_time` | time | Час початку |
| `duration_minutes` | int | Тривалість (хв) |
| `subject` | text | Назва події |
| `outlook_event_id` | text | ID події в Outlook |
| `outlook_modified` | boolean | Змінено в Outlook (PULL виявив різницю) |
| `needs_push` | boolean | Локальні зміни потребують Push |
| `has_transcript` | boolean | Є транскрипція зустрічі |
| `transcript_summary` | text | AI-саммарі транскрипції |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

**7 статусів плиток:** collected (purple, daily_task_id) → returned (red, outlook_modified) → templated (amber, task_template_id) → modified (cyan, needs_push) → synced (green, outlook_event_id) → external (gray) → distributed (blue).
**Outlook sync:** двосторонній. PULL: delta query з Graph API. PUSH: batch `$batch` API (create/update).
**Collect:** групування entries по `task_template_id` → створення `daily_task` на групу.
**Auto-suggest:** `GET /api/planner/entries/suggest?weekStart=` — 2 стратегії (previous week + proportional). Ghost-блоки на UI.

---

## Шаблоны задач процедур

### `procedure_task_templates` — PLANNED (ADR [25])

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `procedure_id` | uuid FK → procedures | Процедура |
| `title` | text NOT NULL | Короткое название (видит сотрудник) |
| `content` | text NOT NULL | Описание задачи (подставляется в description + используется AI) |
| `is_active` | boolean | DEFAULT true |
| `created_by` | uuid FK → user_profiles | NULL = системный |
| `created_at` | timestamptz | |

Справочник типовых задач для процедуры. Сотрудник нажимает «Взяти» → создаётся `daily_task` с `title` (readonly) и `description` (из content, редактируемый). Шаблон остаётся на месте для повторного использования.

---

## AI-эталоны

### `ai_reference_examples` — 190 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `category` | text | task_description, company_report_note |
| `procedure_id` | uuid FK → procedures | |
| `content` | text | Эталонный текст |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |
| `source` | text | manual, approved_report, auto |
| `approved_by` | uuid FK → user_profiles | |
| `metadata` | jsonb | |
| `created_at` | timestamptz | |

---

## Отчеты

### `company_report_notes` — 68 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `company_id` | uuid FK → companies | |
| `procedure_id` | uuid FK → procedures | |
| `year` | integer | |
| `month` | integer | |
| `note` | text | AI-сгенерированное примечание |
| `created_at` | timestamptz | |

---

## Бот-платформа

### `bot_permissions` — 22 строки

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `role` | text | employee, head, chief |
| `tool_name` | text | Имя инструмента из реестра |
| `is_enabled` | boolean | |
| `scope` | text | own, department, all |
| `updated_at` | timestamptz | |

### `telegram_notification_settings` — 2 строки

| `event_type` PK | `is_enabled` | `label` | `updated_at` |
|---|---|---|---|

---

## Knowledge Base

### `kb_categories` — 4 строки

| `id` | `name` (unique) | `slug` (unique) | `description` | `icon` | `is_active` | `created_at` |
|---|---|---|---|---|---|---|

### `kb_documents` — 29 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `title` | text | |
| `content` | text | Полный текст (до 100K символов) |
| `source_filename` | text | Имя исходного .docx |
| `mime_type` | text | |
| `category_id` | uuid FK → kb_categories | |
| `process_id` | uuid FK → processes | |
| `chunk_count` | integer | Количество чанков |
| `status` | text | processing, ready, error |
| `error_message` | text | |
| `metadata` | jsonb | |
| `created_by` | uuid FK → user_profiles | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `kb_chunks` — 446 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `document_id` | uuid FK → kb_documents | |
| `chunk_index` | integer | Порядковый номер |
| `content` | text | Чистый текст (без контекстного префикса) |
| `embedding` | vector(1024) | Voyage multilingual-2 |
| `heading` | text | Заголовок раздела |
| `token_count` | integer | |

**Индексы:**
- `idx_kb_chunks_hnsw` — HNSW (vector_cosine_ops), m=16, ef_construction=64
- `idx_kb_chunks_fts` — GIN(to_tsvector('uk', content))

### `kb_query_log` — 65 строк

| Колонка | Тип | Описание |
|---------|-----|----------|
| `id` | uuid PK | |
| `user_id` | uuid FK → user_profiles | |
| `user_role` | text | employee, head, chief |
| `source` | text | telegram, teams, web |
| `query_original` | text | Оригинальный запрос |
| `query_translated` | text | Перевод на украинский |
| `category_hint` | text | Подсказка категории |
| `category_detected` | text | Определённая категория |
| `top_score` | float4 | Лучший score |
| `rerank_top_score` | float4 | Score после rerank |
| `chunks_found` | smallint | |
| `search_attempt` | text | Какая попытка сработала |
| `ai_refused` | boolean | Отказ от синтеза |
| `synthesis_cost` | numeric | Стоимость AI |
| `answer_text` | text | Сгенерированный ответ |
| `triage_label` | text | bad_docs, bad_query, garbage, out_of_scope, ok |
| `triage_note` | text | |
| `triaged_by` | uuid FK → user_profiles | |
| `triaged_at` | timestamptz | |
| `created_at` | timestamptz | |

---

## Безопасность (RLS)

Все 28 таблиц имеют RLS ENABLED с политикой `TO authenticated`.

**Важно:** текущая политика — это проверка "пользователь залогинен", а не row-level фильтрация по user_id. Все authenticated пользователи видят все строки. Для внутренней системы из ~23 сотрудников одного подразделения это осознанный трейдофф — ролевая фильтрация реализована в API routes (через `getDbUserId(req)` + scope enforcement). RPC с бизнес-логикой имеют `SECURITY DEFINER`.

### SECURITY DEFINER RPC

| Функция | Причина |
|---------|---------|
| `manage_procedure` | Ролевая проверка внутри |
| `get_activity_feed` | UNION из нескольких таблиц |
| `get_projects_for_user` | Cross-department фильтрация |
| `match_kb_documents` | Обход RLS для vector search |

---

## Легаси

Weekly-модель полностью удалена: таблицы (миграция 20260209), RPC `manage_weekly_task` (миграция 20260303).
