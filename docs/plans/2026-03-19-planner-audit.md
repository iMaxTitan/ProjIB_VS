# Планувальник — Аудит модуля (2026-03-19)

## 1. Плани в сайдбарі

### Що є
- Завантажуються місячні плани зі статусами `active` + `completed`
- Бейдж статусу (violet = "В роботі", green = "Виконано")
- Drag & drop процедур на сітку календаря
- Кнопка "Зібрати задачі" (collect) — збирає calendar entries в completed task
- Прогрес-бар: синхронізовано / розподілено / заплановано
- `completed` план → read-only: не можна drag, collect, створювати entries

### Що потрібно перевірити / доробити
- [ ] Чи коректно працює фільтрація, коли один procedure має і active і completed план (різні місяці)?
- [ ] Відображення при відсутності планів — empty state
- [ ] Сортування планів у сайдбарі (зараз як з БД)

---

## 2. Календар (сітка)

### Що є
- Сітка Пн-Пт, 9:00-18:00, крок 30 хв
- Два типи entries: `plan` (створені користувачем) і `external` (з Outlook)
- Drag & drop entries по сітці (зі зсувом overlaps)
- Resize entries (тягання за нижній край)
- Delete plan entries
- Lunch zone (настроюється, за замовчуванням 13:00)
- NOW line (поточний час)
- Vacation days (блокують створення)
- Overlap resolution (автоматичний зсув)
- Статуси CSS: `st-distributed`, `st-synced`, `st-returned`, `st-external`, `st-draft-task`, `st-completed`

### Outlook Sync
- **PULL** (delta sync): Graph API `/calendarView/delta` → reconcile → backfill subjects + transcript status
- **PUSH**: unsync'd plan entries → batch create в Outlook (max 20)
- `outlook_modified` flag — якщо подію змінили в Outlook

### Зустрічі
- Клік на external entry → CalendarMeetingModal (attendees, transcript)
- AI Summary (Claude Haiku) для транскрипцій зустрічей
- Кеш в `meeting_cache` (shared) + per-user `transcript_summary`

### Suggest (AI автозаповнення)
- Стратегія 1: повтор минулого тижня (+7 днів)
- Стратегія 2: пропорційний розподіл по бюджету
- Ghost blocks на сітці (прийняти/відхилити/resize)

### Що потрібно перевірити / доробити (КАЛЕНДАР)
- [ ] Старі пережитки в sync логіці — перевірити calendar-sync.ts, calendar-sync-reconcile.ts
- [ ] `entryStatus()` — логіка визначення статусу entry складна і можливо не всі кейси правильні
- [ ] Обробка помилок при sync (push/pull) — наскільки graceful
- [ ] Copy week — чи враховує completed плани (не повинна копіювати entries completed планів)
- [ ] Suggest — чи враховує completed плани (не повинна пропонувати для completed)
- [ ] External events від completed планів — що з ними робити?
- [ ] Resize handle видимий тільки при hover — UX питання

---

## 3. Задачі

### Що є
- TaskPickerDropdown на calendar entry: шаблони, незавершені, від chief/head, чернетки
- TasksModal для створення задачі з шаблону
- PlannerTasksDetail — панель задач по процедурі
- Task types: `draft` → `incomplete` → `pending_approval` → `completed` / `rejected`
- Task sources: `manual`, `template`, `chief`, `head`, `calendar`
- Бейджі CHIEF/HEAD для задач від керівництва
- Collect: збір calendar entries в один completed task
- Company distribution копіюється з плану

### Чернетки (Drafts)
- TasksPanel — quick input ("Задача 2.5г" — парсить години)
- Створення з зустрічі (document_number = outlook_event_id)
- AI suggest: до якого плану прив'язати
- Assign: plan_id ставиться, type → incomplete

### Шаблони задач
- CRUD в `procedure_task_templates`
- AI генерація шаблону з опису

### Що потрібно перевірити / доробити (ЗАДАЧІ)
- [ ] Read-only для completed планів — ЗРОБЛЕНО (цей коміт)
- [ ] Чи працює TaskPicker для entries completed планів (не повинен)
- [ ] Валідація годин при collect — чи правильно рахує
- [ ] Draft → assign: чи коректно копіюються компанії
- [ ] Edge case: задача на стику двох місяців (entry в одному, план в іншому)

---

## 4. Бізнес-правила & обмеження

| Правило | Деталь |
|---------|--------|
| Робочий час | 9:00–18:00 |
| Обід | за замовчуванням 13:00, настроюється |
| Відпустки | блокують створення entries |
| Overlap | заборонено: два plan entries в один час |
| Collected entries | daily_task_id != NULL → read-only |
| External events | read-only (не можна видалити/перемістити) |
| Completed plan | read-only: не можна drag, create/delete/resize entries, add/edit tasks, collect |
| Ліміт тижня | 40г (2400 хв) для suggest |
| Валідація | години: 0.1–24г, опис: мін 3 символи |

---

## 5. Файли модуля

### Сервіси (`lib/ops/planner/`)
| Файл | Опис |
|------|------|
| calendar-entries.ts | Read: entries тижня, active plans, vacation days |
| calendar-entries-write.ts | CRUD entries, copy week |
| calendar-shared.ts | Constants, Graph helpers |
| calendar-sync.ts | PULL з Outlook (delta) |
| calendar-sync-reconcile.ts | Reconcile events |
| calendar-sync-backfill.ts | Backfill subjects + transcripts |
| calendar-push.ts | PUSH в Outlook (batch) |
| task-service.ts | Task CRUD |
| task-validation.ts | Валідація годин/опису |
| task-templates.ts | Template CRUD |
| drafts.ts | Draft CRUD + assign |
| weekly-suggest.ts | AI suggest entry point |
| weekly-suggest-strategies.ts | Suggest алгоритми |
| meeting-details.ts | Meeting info з Graph |
| meeting-summary.ts | AI summary транскрипції |
| collect-tasks.ts | Збір entries в completed task |

### Хуки (`hooks/`)
| Файл | Опис |
|------|------|
| usePlanner.ts | Weekly entries + CRUD mutations |
| usePlannerSync.ts | Pull/Push mutations |
| usePlannerTasks.ts | Task picker data |
| usePlannerDrafts.ts | Draft CRUD + AI suggest |
| useTaskTemplates.ts | Template CRUD |

### Компоненти (`components/dashboard/planner/`)
| Файл | Опис |
|------|------|
| PlannerContent.tsx | Main container + DnD |
| PlannerHeader.tsx | Toolbar: sync, suggest, copy, lunch |
| PlannerGrid.tsx | Calendar grid 5×18 |
| PlannerBlocks.tsx | Entry/ghost blocks |
| PlannerSidebar.tsx | Plans list (draggable) |
| PlannerFilters.tsx | Week navigation |
| PlannerStats.tsx | Week summary |
| PlannerTasksDetail.tsx | Task detail panel |
| TaskPickerDropdown.tsx | Inline task picker |
| TasksModal.tsx | Task creation modal |
| CalendarMeetingModal.tsx | Meeting details modal |
| TaskTemplatePicker.tsx | Template selector |
| CompanyDistributionSelector.tsx | Company assignment |
| planner-helpers.ts | DnD, layout, date utils |

---

## 6. Зроблені зміни (2026-03-19)

- [x] Бейдж статусу плана (active/completed) замість departmentCode на плитках сайдбару
- [x] Completed план → read-only: drag, entries, tasks, collect заблоковані
- [x] Сортування: active зверху, completed знизу, по назві процедури
- [x] Empty state: "Немає планів на цей період"
- [x] Completed плитки: opacity-70 + cursor:default
- [x] Collect → task_type: 'incomplete' (не 'completed')
- [x] Collect включає привязані external entries (не тільки plan)
- [x] FK ON DELETE SET NULL — видалення задачі автоматично розблоковує entries
- [x] Assign draft → `incomplete` (не `pending_approval`), кнопка "Прив'язати до плану"
- [x] TemplateList → `/api/planner/templates` (замість старого `/api/cabinet/task-templates`)
- [x] Collect API: приймає `title` + `companyIds` з UI
- [x] TasksModal: передає title + selectedCompanyIds при collect
- [x] TaskPicker (external): фільтрує completed плани, показує тільки active
- [x] Бейдж departmentCode повернуто, колір залежить від статусу плану
- [x] Lunch dropdown: click-outside закриває
- [x] Header: заголовок прибрано, кнопки: disabled=вдавлені, hover=підняті+свічення
- [x] Видалено: TasksPanel.tsx, useSuggestDrafts, /api/planner/drafts/suggest
- [x] BUG FIX: PULL external entries + backfill subjects — фільтр по тижню
- [x] BUG FIX: транскрипт "не доступен" — API завжди перевіряє Graph, UI бере info.hasTranscript
- [x] Модель AI summary: claude-3-haiku → claude-haiku-4-5
- [x] Graph helpers: meeting-details + meeting-summary імпортують GRAPH_BASE з calendar-shared
- [x] Collect: meeting subject → title, transcript_summary → description (stripped HTML)
- [x] Бот draft-task.ts: повідомлення "у планувальнику" замість "у кабінеті"

## 7. Цільовий флоу календаря (узгоджено)

1. Завантаження тижня → PULL з Outlook
2. Ручне розташування слотів (drag процедур) або AI Suggest
3. Unsync'd entries → pulsing dot → PUSH в Outlook → синхронізовано
4. Зовнішні події (Outlook) → прив'язати до плану/задачі через picker
5. Зміни в Outlook → PULL → позначає modified
6. Collect: всі entries процедури (plan + linked external) → одна incomplete задача
7. Зібрані entries → read-only; видалення задачі → розблокування (FK SET NULL)
8. Подальша робота із задачами — в розділі Задачі, не в календарі

## 8. Цільовий флоу задач (узгоджено)

1. Панель задач відображається тільки коли обрано план
2. Показуються задачі плану + чернетки (без плану)
3. Клік на чернетку → модалка → прив'язка до обраного плану → `incomplete`
4. Кнопка "На узгодження" з'являється для incomplete задач → `pending_approval`
5. Manager: узгодити (`completed`) або відхилити (`rejected`)
6. Collect: entries процедури → одна incomplete задача з title + компаніями
7. Компанії: прив'язані до плану, при створенні задачі user обирає конкретні
8. Completed план не блокує задачі — незатверджені просто не враховуються в KPI/звітах
9. TaskPicker для external — тільки active плани

## 9. TODO (окрема робота)

### Статуси / кольори календаря
- [ ] entryStatus() — привести до реальних статусів, прибрати мертві (st-completed, st-draft-task, st-draft)
- [ ] LEGEND_ITEMS — синхронізувати з реальними статусами
- [ ] Візуальне виділення: collected entries, completed plan entries — потребує окремого дизайну
- [ ] Cursor для readOnly plan entries (зараз cursor-grab хоча drag disabled)

### Header / Toolbar
- [ ] Toggle день/тиждень (mobile must have)

### Stats
- [ ] `weeklyCapacity = 32` — ХАРДКОД, потім замінити на `user_profiles.work_rate * 40`
- [ ] Без вибраного плану — статистика по всіх планах тижня
- [ ] З вибраним планом — статистика тільки по ньому
- [ ] Прибрати невикористаний проп `activePlans`

### Meeting Modal
- [ ] Перерисувати UI в стилі дизайн-системи (glass-panel, element-card)
- [ ] Видалити старий endpoint `/api/cabinet/task-templates`

### Рефакторинг (після завершення всіх функцій)
- [ ] GhostBlock: inline styles → CSS-класи
- [ ] Mobile UX: toggle день/тиждень, mobile-first Stats
- [ ] Загальний рефакторинг модуля (дублі, зайвий код)
