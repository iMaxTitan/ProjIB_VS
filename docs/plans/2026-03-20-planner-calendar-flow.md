# Planner Calendar Flow — Design Document

> Дата: 2026-03-20
> Статус: Узгоджено

## Таблиця: weekly_calendar_entries

Колонки:
- `id`, `employee_id`, `date`, `start_time`, `duration_minutes`
- `source` ('plan' | 'external')
- `monthly_plan_id` — FK на monthly_plans (яка процедура)
- `outlook_event_id` — ID події в Outlook (null = не в Outlook)
- `outlook_modified` — змінено в Outlook, потрібна увага користувача
- `needs_push` — **НОВА** boolean default false — змінено у нас, потрібен Push
- `task_template_id` — FK на procedure_task_templates (обраний шаблон задачі)
- `daily_task_id` — FK на daily_tasks (зібрано в задачу)
- `subject`, `has_transcript`, `transcript_summary`

## Статуси плиток

Пріоритет (зверху вниз):

| # | Статус | Колір | Умова | Опис |
|---|--------|-------|-------|------|
| 1 | `collected` | фіолетовий | daily_task_id | Зібрано в задачу, readOnly |
| 2 | `returned` | червоний | outlook_modified = true | Змінено в Outlook, потрібна увага |
| 3 | `templated` | amber | task_template_id, нет daily_task_id | Обрано шаблон задачі |
| 4 | `modified` | cyan | outlook_event_id + needs_push = true | Змінено у нас, потрібен Push |
| 5 | `synced` | зелений | outlook_event_id, needs_push = false | Синхронізовано з Outlook |
| 6 | `external` | сірий | source = external | Зовнішня подія |
| 7 | `distributed` | синій | все інше | Розподілено, не в Outlook |

## Drag / Resize / ReadOnly

| Статус | Опис | Drag | Resize | При зміні |
|--------|------|------|--------|-----------|
| `distributed` | Розподілено, не в Outlook | ✅ | ✅ | — |
| `synced` | Синхронізовано з Outlook | ✅ | ✅ | needs_push = true |
| `modified` | Змінено у нас, потрібен Push | ✅ | ✅ | needs_push вже true |
| `returned` | Змінено в Outlook | ✅ | ✅ | outlook_modified = false, визначається needs_push |
| `templated` | Обрано шаблон задачі | ✅ | ✅ | needs_push = true (якщо є outlook_event_id) |
| `collected` | Зібрано в задачу | ❌ | ❌ | readOnly |
| `external` | Зовнішня подія | ❌ | ❌ | readOnly |

### returned — реакція на drag/resize
- Будь-який drag/resize → `outlook_modified = false`
- Якщо новий розмір/час = те що в Outlook → `needs_push = false`
- Якщо новий розмір/час ≠ → `needs_push = true`

## Кнопки на плитках

| Статус | Badge зверху (ClipboardList) | Action знизу (Trash) |
|--------|------------------------------|---------------------|
| `distributed` | Обрати шаблон | Видалити entry |
| `synced` | Обрати шаблон | Видалити entry |
| `modified` | Обрати шаблон | Видалити entry |
| `returned` | — | — |
| `templated` | — | Зняти шаблон |
| `collected` | — | — |
| `external` | Обрати шаблон (тільки якщо обрана процедура в sidebar) | — |

Примітка: external з `task_template_id` → статус `templated` → Trash знімає шаблон.

## Текст на плитці

| Статус | Текст |
|--------|-------|
| `distributed` | Назва процедури |
| `synced` / `modified` | Назва шаблону (якщо є) або назва процедури |
| `returned` | Subject з Outlook (перезаписаний Pull-ом) |
| `templated` | Назва шаблону |
| `collected` | Назва шаблону |
| `external` | Subject з Outlook |

## Іконки-індикатори

| Іконка | Коли |
|--------|------|
| ✨ Sparkles (indigo) | external + є AI саммарі |
| 📜 ScrollText (сірий) | external + є транскрипт, нема саммарі |
| ⚠️ AlertTriangle (amber) | outlook_modified = true (returned) |

## Кнопки хедера

| Кнопка | Іконка | Коли активна | Дія |
|--------|--------|-------------|-----|
| AI Suggest | Wand2 | Завжди | Пропонує розподіл |
| Copy week | Copy | Завжди | Копіює минулий тиждень |
| Lunch | UtensilsCrossed | Нема жодного plan entry на тижні | Вибір часу обіду |
| Push ↑ | Upload | Є entries без outlook_event_id АБО needs_push = true | Створює/оновлює в Outlook |
| Pull ↓ | Download | Є outlook_modified entries | Приймає зміни з Outlook |

## Push (↑)

1. Entries де `outlook_event_id IS NULL` → **створює** нові events в Outlook
2. Entries де `needs_push = true` → **оновлює** існуючі events (PATCH: час, тривалість, subject)
3. Subject = `template_title` (якщо є) або `procedure_name`
4. Після успіху: `outlook_event_id` = ID, `needs_push = false`
5. НЕ чіпає external entries
6. `outlook_event_id` НІКОЛИ не скидається при змінах — тільки при видаленні entry

## Pull (↓) — автопул при зміні тижня

1. Підтягує external events → створює/оновлює `source = 'external'`
2. Перевіряє plan entries з `outlook_event_id`:
   - Час/тривалість/subject змінились → перезаписує наші дані + `outlook_modified = true`
   - Event видалено → `outlook_event_id = null`, `needs_push = false`
3. Оновлює транскрипції зустрічей
4. При конфлікті (юзер змінив + Outlook змінив): Outlook wins, дані перезаписуються, `outlook_modified = true`. Юзер бачить червону плитку → drag/resize щоб виправити.

## Вибір шаблону (ClipboardList)

1. Клік на badge або на plan-плитку → TaskPickerDropdown
2. Для plan entries: шаблони процедури з `monthly_plan_id`
3. Для external: шаблони обраної процедури з sidebar
4. При виборі:
   - `task_template_id` = ID шаблону
   - `needs_push = true` (якщо є outlook_event_id)
   - Текст змінюється на назву шаблону
   - daily_task НЕ створюється

## Зняття шаблону (Trash на templated)

1. `task_template_id = null`
2. `needs_push = true` (якщо є outlook_event_id)
3. Текст повертається до назви процедури / subject

## Collect (ClipboardCheck на процедурі в sidebar)

1. Кнопка активна: є хоча б один entry з `task_template_id` без `daily_task_id`
2. Збирає entries з `task_template_id` (entries без шаблону ігноруються)
3. Групує по `task_template_id`:
   - Однаковий шаблон → одна daily_task, години сумуються
   - Задачі від шефа → кожна окремо, статус `pending_approval`
   - Звичайні → статус `incomplete`
4. `monthly_plan_id` для task: від plan entry. Для external entry з шаблоном — від обраної процедури в sidebar
5. Створює daily_tasks, прописує `daily_task_id` на entries
6. **Без модалки**
7. Invalidate: `PLANNER_ENTRIES_KEY` + `PLANNER_TASKS_KEY`

## Видалення daily_task

1. Очищується `daily_task_id` на entries
2. `task_template_id` залишається → entries повертаються в `templated`
3. `needs_push` НЕ змінюється — задача і планування не пов'язані жорстко
4. Можна зібрати знову

## Видалення entry (plan)

1. Видаляється з weekly_calendar_entries
2. Якщо був `outlook_event_id` → видаляється event з Outlook
3. Якщо був `daily_task_id` → очищується зв'язок

## Нова колонка БД

```sql
ALTER TABLE weekly_calendar_entries
ADD COLUMN needs_push boolean NOT NULL DEFAULT false;
```

## Зміни в коді

### CalendarEntry type + select
- Додати `needs_push` в interface, select, UpdateEntryParams

### entryStatus (PlannerBlocks.tsx)
- Новий пріоритет: collected → returned → templated → modified → synced → external → distributed
- readOnly = `collected` або `external` (без template)

### calendar-entries-write.ts (updateEntry)
- При зміні date/start_time/duration_minutes: `needs_push = true` (якщо є outlook_event_id), `outlook_modified = false`
- При зміні task_template_id: `needs_push = true` (якщо є outlook_event_id)
- НЕ скидати outlook_event_id при змінах

### calendar-push.ts
- Create: entries без outlook_event_id
- Update (PATCH): entries з needs_push = true
- Subject = template_title || procedure_name
- Після успіху: needs_push = false

### calendar-sync-reconcile.ts (Pull)
- Plan entries змінені → перезаписати дані + outlook_modified = true
- Plan entries видалені → outlook_event_id = null, needs_push = false

### PlannerHeader.tsx
- Push: disabled коли нема (entries без outlook_event_id) І нема (needs_push = true)
- Pull: disabled коли нема outlook_modified
- Lunch: disabled коли є plan entries

### PlannerContent.tsx
- handleLinkTask → set task_template_id + needs_push
- handleClearTemplate → clear task_template_id + needs_push
- handleCollectTasks → без модалки, групування по template, створення tasks

### CSS
- st-modified (cyan) — НОВИЙ
- st-templated (amber) — є
- st-collected (фіолетовий) — є
