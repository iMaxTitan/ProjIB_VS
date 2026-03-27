# Великий Календар — Design Document (ARCHIVED)

> Дата: 2026-03-09
> Статус: **ARCHIVED** — реалізовано як модуль «Планувальник» (`lib/ops/planner/`). Актуальний дизайн: `docs/plans/2026-03-20-planner-calendar-flow.md`

## Проблема

Сотрудник працює з кількома джерелами подій (наші плани, Outlook, Teams, Viva), але немає єдиної моделі яка б відповідала:
- Звідки подія? (CS Platform чи зовнішня)
- Який її статус? (розподілена / синхронізована / в задачі)
- Чи вже враховано в daily_task?
- Чи є транскрипт зустрічі і його саммарі?

Поточні проблеми:
- `weekly_plan_slots.procedure_id` — дублює `monthly_plans.procedure_id`
- `daily_tasks.document_number` — костиль для звʼязку meeting → task, не працює для many-to-one
- Зустрічі живуть тільки в Graph API — немає запису в БД для привʼязки до задачі
- Кожна дія (drag, confirm, delete) → окремий запит до Graph API (повільно, rate limits)
- Керівник не може побачити календар співробітника без Graph-доступу

### Що дає нова модель

- **Спрощення контролю статусів** — один рядок у БД = один блок на сітці, статус читається з полів без хаків
- **Менше навантаження на Graph** — один PULL (delta query, тільки зміни) + один batch PUSH замість N окремих запитів
- **Видимість для керівників** — дані в нашій БД, не потрібен Graph-доступ за кожного

## Рішення

### Єдина таблиця `weekly_calendar_entries`

Кожен блок на тижневій сітці = рядок у таблиці. Незалежно від джерела.

```sql
CREATE TABLE weekly_calendar_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES user_profiles(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,

  -- Джерело
  source TEXT NOT NULL CHECK (source IN ('plan', 'external')),
  monthly_plan_id UUID REFERENCES monthly_plans(id),
  -- source='plan' → monthly_plan_id NOT NULL
  -- Процедура = monthly_plans.procedure_id (НЕ дублюємо)

  -- Outlook звʼязок
  outlook_event_id TEXT,
  -- source='plan': NULL = не синхронізовано, NOT NULL = синхронізовано
  -- source='external': завжди NOT NULL (це І є зовнішня подія)

  -- Звʼязок із задачею
  daily_task_id UUID REFERENCES daily_tasks(daily_task_id) ON DELETE SET NULL,
  -- NULL = не в задачі
  -- NOT NULL = враховано в цю задачу (many-to-one: кілька записів → одна задача)
  -- ON DELETE SET NULL — видалення задачі повертає блок у стан "не в задачі"

  -- Метадані зовнішніх подій (кеш з Graph)
  subject TEXT,                          -- заголовок події
  has_transcript BOOLEAN NOT NULL DEFAULT FALSE,
  transcript_summary TEXT,               -- AI саммарі транскрипта

  -- Reconciliation (LWW — "право останньої руки")
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Порівнюється з Graph lastModifiedDateTime (завжди UTC, precision 100ns)
  -- Обидва значення UTC — пряме порівняння без конвертації

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT plan_requires_monthly_plan CHECK (
    source != 'plan' OR monthly_plan_id IS NOT NULL
  ),
  CONSTRAINT external_requires_outlook_id CHECK (
    source != 'external' OR outlook_event_id IS NOT NULL
  ),
  CONSTRAINT plan_duration_granularity CHECK (
    source != 'plan' OR (duration_minutes >= 30 AND duration_minutes % 30 = 0)
  ),
  CONSTRAINT external_duration_positive CHECK (
    source != 'external' OR duration_minutes >= 1
  )
);

-- Індекси
CREATE INDEX idx_wce_employee_date ON weekly_calendar_entries(employee_id, date);
CREATE INDEX idx_wce_employee_week ON weekly_calendar_entries(employee_id, date)
  WHERE source = 'plan';  -- для швидкого overlap check
CREATE UNIQUE INDEX idx_wce_outlook_event ON weekly_calendar_entries(outlook_event_id)
  WHERE outlook_event_id IS NOT NULL;
CREATE INDEX idx_wce_daily_task ON weekly_calendar_entries(daily_task_id)
  WHERE daily_task_id IS NOT NULL;  -- для зворотнього lookup "задача → які блоки"
```

### Delta Sync — таблиця стану синхронізації

```sql
CREATE TABLE calendar_sync_state (
  employee_id UUID PRIMARY KEY REFERENCES user_profiles(id),
  delta_token TEXT,              -- opaque token від Graph delta query
  last_synced_at TIMESTAMPTZ,   -- коли останній раз синхронізували
  sync_error TEXT                -- остання помилка (NULL = ok)
);
```

### Гранулярність тривалості

- **Plan-слоти (наші):** мінімум 30 хв, крок 30 хв (CHECK constraint)
- **External-події:** будь-яка тривалість ≥1 хв (Outlook дозволяє 15, 25, 45 хв тощо)
- Це різні constraints на одній таблиці, розділені по `source`

### Правила перекриття

- **Plan-слоти**: максимум один на часовий інтервал (overlap check на клієнті + серверна валідація)
- **External-події**: можуть перекриватися скільки завгодно (реальність Outlook)
- Plan + External: можуть перекриватися (зустріч під час процедури — нормально)

### Ідентифікація CS Platform подій в Outlook

При створенні події в Outlook — Extended Property з `monthly_plan_id`:

```json
{
  "singleValueExtendedProperties": [{
    "id": "String {CS-PLATFORM-GUID} Name CsPlatformEntryId",
    "value": "<weekly_calendar_entries.id>"
  }]
}
```

При PULL — перевіряємо: є extended property → це наша подія (match по entry id), не створюємо дублікат як external.

**Caveat:** Extended properties на копії організатора НЕ копіюються на attendee. Тому додатково матчимо по `outlook_event_id` з нашої БД — це надійніший спосіб.

### Workflow: "PULL → працюй локально → PUSH"

```
┌─ PULL (delta query — тільки зміни) ──────────────────────┐
│                                                            │
│ Перший раз:                                                │
│   GET /me/calendarView/delta?startDateTime=...&endDateTime= │
│   → отримуємо ВСІ події тижня + deltaToken                │
│   → зберігаємо deltaToken в calendar_sync_state            │
│                                                            │
│ Наступні рази:                                             │
│   GET /me/calendarView/delta?$deltatoken=<saved>           │
│   → отримуємо ТІЛЬКИ змінені/нові/видалені                │
│   → значно менше даних і запитів                           │
│                                                            │
│ Reconciliation:                                            │
│   • Match по outlook_event_id з нашою БД                   │
│   • Наша подія (є extended property) → skip external       │
│   • Нова зовнішня → INSERT source='external'               │
│   • Змінена → LWW: updated_at vs lastModifiedDateTime      │
│   • @removed → DELETE external з нашої БД                  │
│   • Збережена зовнішня з daily_task_id → НЕ видаляємо,    │
│     помічаємо як cancelled (захист даних)                   │
│                                                            │
│ Тригер PULL:                                               │
│   1. Відкриття планера співробітником                      │
│   2. Запит керівника (якщо last_synced_at > 5 хв)          │
│   3. Можливо: cron кожні 15 хв для активних користувачів  │
└────────────────────────────────────────────────────────────┘

┌─ WORK (клієнт, без Graph, тільки наша БД) ───────────────┐
│ • Drag plan → INSERT entry (source='plan')                 │
│ • Resize → UPDATE duration_minutes                         │
│ • Move → UPDATE date/start_time                            │
│ • Delete → DELETE entry                                    │
│ • "В задачу" → SET daily_task_id                           │
│ • "Саммарі" → AI summarize transcript → save               │
│                                                            │
│ Клієнт збирає diff у React state:                          │
│   pending: { create: [...], update: [...], delete: [...] } │
└────────────────────────────────────────────────────────────┘

┌─ PUSH ("Затвердити" — batch через Graph $batch) ─────────┐
│                                                            │
│ POST /api/calendar/sync — збирає diff для Outlook:         │
│ • Нові plan-слоти (outlook_event_id IS NULL) → CREATE      │
│ • Змінені plan-слоти → UPDATE                              │
│ • Видалені plan-слоти (мали outlook_event_id) → DELETE     │
│                                                            │
│ Виконання через Graph $batch (до 20 операцій/запит):       │
│ {                                                          │
│   "requests": [                                            │
│     { "id":"1", "method":"POST", "url":"/me/events", ...}, │
│     { "id":"2", "method":"PATCH","url":"/me/events/{id}"},│
│     { "id":"3", "method":"DELETE","url":"/me/events/{id}"}│
│   ]                                                        │
│ }                                                          │
│                                                            │
│ Обробка часткових помилок (saga pattern):                  │
│   Кожна операція — незалежна транзакція:                    │
│   • 2xx → зберегти outlook_event_id, оновити updated_at   │
│   • 429 (throttle) → enqueue retry з exponential backoff  │
│   • 404 → подія видалена ззовні, очистити outlook_event_id│
│   • 5xx → retry через 5 сек, макс 3 спроби               │
│   Успішні НЕ відкочуються при помилці інших               │
│   Невдалі залишаються без outlook_event_id — retry пізніше│
│                                                            │
│ Якщо > 20 операцій → розбити на кілька $batch запитів     │
└────────────────────────────────────────────────────────────┘
```

### Життєвий цикл блоку на сітці

**Plan-слот (наша процедура):**
```
Розподілено (source='plan', outlook_event_id=NULL)
     │
     ├── [Затвердити] → Синхронізовано (outlook_event_id заповнено)
     │
     ├── [В чернетку] → daily_task_id → task без monthly_plan_id
     │
     └── [В задачу]   → daily_task_id → task з monthly_plan_id
```

**External-подія (Outlook/Teams/Viva):**
```
Імпортовано (PULL, source='external')
     │
     ├── [В чернетку] → daily_task_id → draft task
     │
     ├── [В задачу]   → daily_task_id → assigned task
     │
     └── [Саммарі]    → transcript_summary (якщо has_transcript=true)
```

### Візуальні статуси на сітці

Статус визначається комбінацією полів — не окремий enum, а деривований:

| source | outlook_event_id | daily_task_id | task status | Візуал |
|--------|-----------------|---------------|------------|--------|
| plan | NULL | NULL | — | 🔵 Розподілено (не синхр.) |
| plan | ✓ | NULL | — | 🟢 Синхронізовано |
| plan | any | ✓ | draft | 🟡 В чернетці |
| plan | any | ✓ | assigned | ✅ В задачі |
| external | ✓ | NULL | — | ⚪ Зовнішня подія |
| external | ✓ | ✓ | draft | 🟡 В чернетці |
| external | ✓ | ✓ | assigned | ✅ В задачі |

### Видимість для керівників

Керівник запитує `GET /api/calendar/week?employee_id=X&week=Y`:
- Якщо `last_synced_at` > 5 хв → тригер PULL для цього співробітника
- Дані повністю з нашої БД — не потрібен Graph-доступ
- Бачить: план-слоти, зовнішні події, статуси задач
- RLS: chief → всі; head → свій відділ; employee → тільки свій

### Майбутнє: обмін планами

Extended Property в Outlook + наша БД дозволяють:
- Керівник розподіляє план → слоти зʼявляються в календарі співробітника
- Співробітник бачить при PULL, може перемістити/видалити
- Двосторонній фідбек через статуси

## Рефакторинг: що змінюється

### БД

| Було | Стало |
|------|-------|
| `weekly_plan_slots` (7 полів, procedure_id дублює) | `weekly_calendar_entries` (єдина таблиця, 12 полів) |
| Зустрічі тільки в Graph | Зустрічі кешуються в БД після PULL |
| `daily_tasks.document_number` для dedup | `weekly_calendar_entries.daily_task_id` прямий FK |
| `outlook_synced` boolean | Наявність `outlook_event_id` = факт синхронізації |
| Немає delta sync | `calendar_sync_state` з delta_token |

**Міграція:** створити нову таблицю → перенести дані з `weekly_plan_slots` → видалити стару.

### `daily_tasks.document_number`

- Більше не використовується для звʼязку meeting/slot → task
- Звʼязок тепер через `weekly_calendar_entries.daily_task_id`
- `document_number` залишається для справжніх документів (номери наказів)

### Hooks

| Було | Стало |
|------|-------|
| `useWeeklyPlanner` (slots + confirm per slot) | Рефакторинг на нову таблицю + batch sync |
| `useDraftTasks` (meetingTaskIds / draftSourceIds хак) | Спрощується — статус на записі календаря |
| — | Новий: `useCalendarSync` — PULL/PUSH логіка |
| — | Новий: `useCalendarBatch` — збирання diff на клієнті |

### API Routes

| Route | Опис |
|-------|------|
| `POST /api/calendar/pull` | Delta query + reconciliation |
| `GET /api/calendar/week` | Записи тижня з БД |
| `POST /api/calendar/sync` | Batch PUSH (create/update/delete в Outlook через $batch) |
| `POST /api/calendar/transcript-summary` | AI саммарі транскрипта |
| `PATCH /api/calendar/entry` | Оновити запис (daily_task_id, тощо) |

### UI

- `SlotBlock`, `MeetingBlock`, `GhostBlock` → уніфікований `CalendarBlock`
- Колір/іконка визначається комбінацією полів (таблиця статусів)
- Кнопка "Затвердити" — batch sync замість confirm per slot
- Suggest (ghost-блоки) залишаються в React state (не в БД) до прийняття

## Рішення слабких місць (v1 → v2)

| Проблема v1 | Рішення v2 |
|-------------|-----------|
| `duration % 30` ламає імпорт зовнішніх подій | Роздільні CHECK constraints: plan ≥30 крок 30, external ≥1 |
| Timezone mismatch updated_at vs Graph | Обидва UTC — Graph завжди `Z`, наш `timestamptz` теж UTC |
| Керівник бачить застарілі дані | Тригер PULL при запиті керівника (якщо stale > 5 хв) |
| Partial failure при batch PUSH | Saga pattern: кожна операція незалежна, retry окремо |
| Видалення задачі ламає FK | `ON DELETE SET NULL` — блок повертається в стан "не в задачі" |
| Breaking change weekly_plan_slots | Поетапна міграція: нова таблиця → перенос даних → видалення старої |

## Прийняті рішення по відкритих питаннях

### 1. Recurring events
Recurring events розгортаються Graph calendarView в окремі occurrences — кожне зберігається як окремий external entry. Не фільтруємо — зберігаємо все що в діапазоні.

### 2. Retention
Зберігаємо **квартал + 1 місяць** (4-6 місяців). Покриває квартальний звіт + поточну роботу. External записи старіше retention і без `daily_task_id` — видаляються по cron або при PULL. Записи з `daily_task_id` — зберігаються завжди (зафіксована робота).

### 3. Webhook + Delta query
**Webhook + delta query** (не або-або):
- Graph change notification (webhook) на `/me/events` → тригер delta query для цього юзера
- Підписка живе 3 дні → renewal через pm2 cron (аналогічно `digest-cron`)
- Fallback: delta query при відкритті планера (якщо webhook пропустив)
- Інфраструктура webhooks вже є (Telegram, Teams)

Додаткові поля в `calendar_sync_state`:
```sql
ALTER TABLE calendar_sync_state ADD COLUMN
  webhook_subscription_id TEXT,          -- Graph subscription ID
  webhook_expires_at TIMESTAMPTZ;        -- коли потрібен renewal
```

### 4. Suggest (auto-distribute)
Адаптувати поточні алгоритми під `weekly_calendar_entries` (не переписувати):
- `suggestFromPreviousWeek` → запит з нової таблиці `WHERE source='plan'`
- `suggestProportional` → той самий бюджетний розрахунок
- **Спрощення:** overlap check тепер з однієї таблиці (plan + external) замість двох джерел (slots + Graph API meetings). Менше коду, надійніше.
