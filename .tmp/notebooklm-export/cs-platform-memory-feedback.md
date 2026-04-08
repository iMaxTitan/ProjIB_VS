

# ===== FILE: feedback-action-over-analysis.md =====

---
name: action-over-analysis
description: Don't over-analyze, don't ask questions you can answer yourself — just do the work
type: feedback
---

Когда задача понятна (например "замени inline RGB на Tailwind") — СРАЗУ делай, не трать время на:
- Длинные таблицы сравнений подходов
- Исследования в интернете
- Многократные "а может так? а может так?"

**Перед тем как задавать вопросы** — убедись что сам не нашёл ответы. Все инструменты есть: код, БД (SSH psql), документация. Не спрашивай "какая структура таблицы?" или "что хранится в квартальном плане?" — посмотри сам.

**Why:** Пользователь — vibe-programmer, не хочет отвечать на вопросы, ответы на которые можно найти в коде/БД. Трата его времени. Обсуждение подхода занимает в разы больше чем сама работа.

**How to apply:** Если задача типовая — сделай сначала, покажи результат. Перед каждым вопросом спроси себя: "Могу ли я найти это сам?" Если да — найди. Задавай вопросы ТОЛЬКО о бизнес-решениях, которых нет в коде. Один короткий вопрос максимум.


# ===== FILE: feedback-approve-before-sync.md =====

---
name: Не синкать и не деплоить без разрешения
description: КРИТИЧЕСКОЕ правило — НИКОГДА не синкать/деплоить/рестартить без ЯВНОЙ команды пользователя. Нарушение = потеря доверия.
type: feedback
---

## КРИТИЧЕСКОЕ ПРАВИЛО — НУЛЕВАЯ ТОЛЕРАНТНОСТЬ

НИКОГДА не выполнять без ЯВНОЙ команды пользователя:
- `tar | ssh` (синк на дев)
- `bash deploy.sh` (деплой на прод)
- `pm2 restart` (рестарт сервера)
- Любое действие, которое затрагивает удалённые серверы

**Единственное исключение:** пользователь явно написал "синк", "синк на дев", "деплой", "рестарт" и т.п.

**Порядок:**
1. Написать код / сделать изменения
2. Показать что сделано
3. ЖДАТЬ команды пользователя
4. Только по явной команде — выполнить

**ЗАПРЕЩЕНО:**
- Синкать "заодно" при typecheck или других проверках
- Синкать + рестартить в одной команде без отдельного разрешения на рестарт
- Предлагать синк проактивно ("синкнуть?")
- Считать что "синк" включает "рестарт" — это разные действия

**Why:** 2026-04-06 нарушил правило — синкнул и рестартнул pm2 без команды. Пользователь справедливо указал что это одно из главных правил. Потеря контроля над тем что попадает на сервер = потеря доверия.

**How to apply:** После КАЖДОГО изменения в коде — замолчать и ждать. Не писать "синкнуть?", не синкать автоматически, не добавлять синк к другим командам.


# ===== FILE: feedback-css-bridge.md =====

---
name: CSS Bridge Rule
description: Never use inline styles for design system properties — use CSS classes from globals.css that mirror demo-design3.html
type: feedback
---

НИКОГДА не использовать inline style={{}} для дизайн-системы (glass-panel, element-card, data-cell, nav-btn, status colors, action buttons). Использовать CSS-классы из globals.css.

**Why:** Целые сутки были потрачены на Планувальник, который пытался воспроизвести дизайн через inline styles. Это привело к: файлам по 500 строк, дрейфу значений между компонентами, нерабочим hover/transition, бесконечным итерациям без результата. Кабінет с обычным Tailwind выглядел лучше, хотя тоже не соответствовал макету — потому что Tailwind-система хотя бы консистентна.

**How to apply:**
1. Все визуальные CSS из demo-design3.html уже есть в `src/styles/globals.css` (секция "Design System")
2. В React: `className="glass-panel rounded-xl p-2"` — CSS для вида, Tailwind для layout
3. Inline style={{}} — ТОЛЬКО для динамических значений (top, left, width, height, transform)
4. При добавлении нового элемента в demo-design3 → синхронизировать CSS в globals.css
5. Верификация: в коде НЕ должно быть inline rgba для фонов/теней/бордеров дизайн-системы

# ===== FILE: feedback-db-logic-first.md =====

---
name: Логика данных — в PostgreSQL, не в JS
description: Архитектурное предпочтение — вью, RPC-функции, constraints в БД. API = тонкая обёртка. Клиент = UI + кеш справочников.
type: feedback
---

Бизнес-логика данных должна быть в PostgreSQL, не в JS коде.

**Правила:**
1. **Вью** для сложных SELECT с join-ами — одно место правды для сущности (пример: `v_monthly_plan_details`)
2. **RPC-функции** для мутаций с каскадами — одна транзакция, вся логика на сервере (пример: `delete_monthly_plan`)
3. **Constraints** (CHECK, UNIQUE) — валидация в БД, не в JS
4. **API route** — тонкая обёртка: auth + rate limit + `db.rpc()` или `db.from(view)`
5. **Клиент** — UI + кеш статичных справочников. Статичные данные (процессы, процедуры) кешировать, не гонять в каждом запросе

**Why:** Один источник правды, транзакционность, меньше кода, проще поддерживать. JS не должен знать как связаны таблицы — он получает готовую сущность.

**How to apply:**
- Новый сложный SELECT с join-ами → сделать вью
- Каскадное удаление/обновление нескольких таблиц → RPC-функция
- Валидация данных → CHECK/UNIQUE constraint
- Не строить клиентские join-ы из нескольких Map если можно дать вью


# ===== FILE: feedback-deploy-target.md =====

---
name: Deploy target and dev sync rules
description: "Деплой" = прод (build + deploy.sh). "Синк на дев" = rsync исходников БЕЗ билда (next dev hot reload).
type: feedback
---

- "Деплой" / "деплой на прод" → `bash deploy.sh` (build локально → tar → App VPS → pm2 restart)
- "Синк на дев" / "деплой на дев" → tar исходников (src/, public/, etc.) → DB VPS `/opt/cs-dev/` → hot reload подхватит
- Дев = полноценный `next dev` сервер. **НИКОГДА не билдить для дева** — только синк исходников.
- Рестарт pm2 cs-dev нужен только при изменении server.js, next.config.js или OOM.

**Why:** Дев работает в dev mode с hot reload. Билд .next для дева бессмыслен и ломает dev-сервер.

**How to apply:** При "деплой на прод и синк на дев" — сначала `bash deploy.sh`, потом tar исходников на дев VPS. См. `memory/infra-deploy-flow.md`.


# ===== FILE: feedback-design-check.md =====

---
name: always-check-design-before-ui
description: ALWAYS check demo-design3.html before writing any UI code - never copy old styles. Use frontend skill + ui-design.md rules for implementation (NOT design-mockup which is for mockup creation only).
type: feedback
---

При создании планировщика (Planner) дизайн был скопирован из старого Cabinet вместо того чтобы следовать эталону demo-design3.html. Результат — весь UI не соответствует дизайн-системе.

**Why:** Пользователь потратил время на создание детального дизайна в demo-design3.html с glass-panel, cal-block, proc-item и другими элементами. Игнорирование эталона = потерянное время на переделку.

**How to apply:**
1. ПЕРЕД написанием ЛЮБОГО UI-кода — открыть demo-design3.html и найти соответствующий элемент
2. Использовать скилл `frontend` + правила `.claude/rules/ui-design.md` для реализации
3. `design-mockup` — ТОЛЬКО для создания/изменения самого макета demo-design3.html
4. Копировать стили ИЗ ЭТАЛОНА, а не из старых компонентов
5. Если элемента нет в эталоне — СПРОСИТЬ пользователя
6. Никогда не "переносить" компоненты — всегда ПЕРЕПИСЫВАТЬ по дизайну
7. После написания — сверить результат с эталоном


# ===== FILE: feedback-design-rewrite.md =====

---
name: feedback-design-rewrite
description: Rules for rewriting UI components from demo-design3.html — must copy exact values, not write from memory
type: feedback
---

При переписывании UI компонентов по demo-design3.html — КОПИРОВАТЬ ТОЧНЫЕ ЗНАЧЕНИЯ, а не писать по памяти.

**Why:** При создании модуля Планувальник (2026-03-18) я "переписал" 8 компонентов, но писал по пониманию вместо построчного переноса значений из эталона. Результат: 3 раунда правок, пользователь ловил баги визуально. Конкретные промахи:
- SLOT_STEP=15 вместо 30 (таблица 2x длиннее)
- Badge из первого слова processName вместо аббревиатуры
- Фильтры: "все недели месяца" вместо 3 кнопок prev/current/next
- TasksPanel: 2-строчный layout вместо inline row
- Не проверял визуально до деплоя

**How to apply:**
1. **Перед написанием компонента** — открыть demo-design3.html, найти ТОЧНУЮ render-функцию
2. **Копировать конкретные значения**: font-size, padding, gap, height, border-radius, colors — НЕ УГАДЫВАТЬ
3. **Сверять константы**: ROW_HEIGHT, SLOT_STEP, ROWS — должны совпадать с эталоном
4. **После каждого компонента** — мысленно сверить структуру HTML с эталоном
5. **Перед деплоем** — проверить ключевые метрики: количество строк grid, размер зон, layout строк
6. **Один проход** — лучше потратить больше времени на первый проход чем делать 3 раунда правок


# ===== FILE: feedback-mcp-postgres-write.md =====

---
name: MCP postgres write access
description: Просить переключить MCP postgres на full control вместо SSH psql для DDL/DML
type: feedback
---

Когда нужно писать в БД (CREATE TABLE, INSERT, ALTER и т.д.) — попросить разрешение у пользователя, затем самому переключить MCP postgres на full control и выполнить запросы. Не использовать SSH psql.

**Why:** Пользователь хочет контролировать момент write-доступа, но не хочет сам переключать — достаточно дать разрешение.

**How to apply:** 1) Спросить разрешение на write-операции. 2) После одобрения — самому переключить MCP на full control. 3) Выполнить DDL/DML. 4) Продолжить работу.


# ===== FILE: feedback-mermaid-diagrams.md =====

---
name: Mermaid для всех схем
description: Все схемы в документации делать в Mermaid — пользователь визуал, смотрит превью в VS Code
type: feedback
---

Все блок-схемы, архитектурные диаграммы, flow-схемы в документации делать в Mermaid (```mermaid блоки в .md файлах).

**Why:** Пользователь — перфекционист и визуал. Хочет видеть схемы в VS Code через Mermaid Preview, корректировать итеративно.

**How to apply:**
- Заменять text/ascii-art схемы на Mermaid
- Стилизация: тёмная тема (fill:#1e293b, stroke: цветовое кодирование, color:#e2e8f0)
- Расширение VS Code: Mermaid Preview (bierner.markdown-mermaid / Mermaid OSS)
- Типы: flowchart TD для иерархий, graph LR для потоков, sequenceDiagram для взаимодействий


# ===== FILE: feedback-minimal-employee-input.md =====

---
name: Минимальный ввод для сотрудников
description: Классификация задач — от шаблона/автоматически, сотрудник вводит только часы и редко комментарий
type: feedback
---

Сотрудник НЕ заполняет вручную work_mode, work_type, effort_weight, expected_hours — всё наследуется от шаблона.

**Why:** Перегрузка вводом = саботаж и грязные данные. Классификационные поля — аналитические метаданные для руководства, не поля для сотрудника.

**How to apply:**
- Путь сотрудника: шаблон → часы → готово. Максимум 2 клика + 1 число.
- deviation_reason — только для исключений, enum из 5-6 вариантов, не freetext.
- Если задача повторяется 3+ раз manual — система предлагает "сделать шаблоном?"
- Все новые поля в стратегии (work_mode, work_type и т.д.) проектировать как auto-inherited, не user-filled.


# ===== FILE: feedback-no-decisions.md =====

---
name: no-unauthorized-decisions
description: NEVER make design/UX/logic decisions without user approval — always ask first
type: feedback
---

НЕЛЬЗЯ принимать решения за пользователя. Даже если кажется "логичным" — СПРОСИ.

**Why:** Пользователь говорит точно что хочет. Claude делал вольности: менял поведение кнопок (Pull always enabled, Push disabled), менял логику без согласования. Это приводило к багам и раздражению.

**How to apply:**
- Если пользователь говорит "Х не работает" → чини Х, НЕ меняй поведение Y и Z "заодно"
- Если нужно изменить поведение → СПРОСИ "хочешь чтобы Pull был disabled/enabled когда...?"
- Никогда не додумывай за пользователя, даже если кажется очевидным
- Делай РОВНО то что просят, ни больше ни меньше


# ===== FILE: feedback-no-deploy.md =====

---
name: STRICT — No deploy without explicit permission
description: СТРОГО ЗАПРЕЩЕНО деплоить без явного разрешения. "да" без слова "деплой" — НЕ разрешение. Спрашивай КАЖДЫЙ раз.
type: feedback
---

СТРОГО ЗАПРЕЩЕНО запускать `bash deploy.sh`, `rsync`, или ЛЮБОЙ деплой/синк без ЯВНОГО разрешения пользователя.

**Why:** Пользователь СТРОГО запретил деплоить без его разрешения. Нарушение этого правила — критическая ошибка. "Да" в ответ на вопрос — НЕ разрешение деплоить, если пользователь не сказал "деплой"/"задеплой" явно.

**How to apply:**
- После завершения работы — сообщить результат (typecheck/lint/build ok)
- СПРОСИТЬ: "Деплоить на прод?" и ЖДАТЬ явного ответа "деплой"/"задеплой"/"да, деплой"
- "да" без контекста деплоя — НЕ разрешение
- Если пользователь показывает баги/проблемы — это НЕ разрешение деплоить
- Синк на дев — тоже требует разрешения, но менее критично


# ===== FILE: feedback-no-dev-build.md =====

---
name: No dev build
description: НИКОГДА не запускать npm run dev или dev-билд — только production build (npm run build)
type: feedback
---

НИКОГДА не запускать `npm run dev` или dev-сервер для проверки работы кода. Только `npm run build` (production build).

**Why:** Dev-билд занимает ресурсы, не отражает реальное поведение, и пользователь явно запретил это. Для проверки кода использовать: `npm run typecheck`, `npm run lint`, `npm run build`.

**How to apply:** При любой проверке кода — только typecheck/lint/build. Dev-сервер (`npm run dev`, `npm run dev:https`) запускать ТОЛЬКО если пользователь явно попросит.


# ===== FILE: feedback-plans-are-primary.md =====

---
name: Plans are primary, processes are static reference
description: Планы — первичная сущность, процессы/процедуры — справочник для фильтрации и паттерн создания
type: feedback
---

Планы — первичная сущность в системе. Процессы и процедуры — статический справочник.

- Годовой план → построен на основе процесса
- Квартальный план → построен на основе процесса  
- Месячный план → построен на основе процедуры ИЛИ инициативы
- Инициативы → справочник (change-контур), параллельно процедурам (routine-контур)

Процессы/процедуры используются для:
- Фильтрации и группировки планов
- Аналитики (KPI по процессу)
- Как паттерн/шаблон при создании планов

**Why:** Пользователь указал что код строился вокруг процедур (ProcedureNode, ProcedureDetailPanel), а должен строиться вокруг планов. Детали — это детали месячного плана, не процедуры.

**How to apply:** При работе с Plans V2 думать в терминах планов. "Открыть план" = показать детали monthly_plan (задачи, часы, ассайны). Процедура/инициатива — это только "на основе чего" создан план. Не путать сущности.

Навигация:
- **Левая панель** — статика: процессы → процедуры (справочник, не меняется)
- **Центр/правая** — динамика: планы, задачи, часы (живые данные, зависят от периода)


# ===== FILE: feedback-postgrest-client.md =====

---
name: PostgREST client — URL building rules
description: Кастомный PostgREST клиент — НЕ использовать URLSearchParams, строить URL вручную. Паттерны из supabase/postgrest-js.
type: feedback
---

PostgREST клиент (`lib/shared/postgrest-client.ts`) строит URL **без URLSearchParams**.

**Why:** URLSearchParams.toString() энкодит скобки `()` → `%28%29`, запятые `,` → `%2C`, пробелы → `+`. PostgREST использует скобки для embedded resources (joins) и запятые для списков колонок. Закодированные URL ломали ВСЕ join-запросы (`monthly_plans(procedures(name))` → "Без процедури").

**How to apply:**
- URL строится через raw `key=value` пары, join('&') — без encoding
- `select()` стрипает ВСЕ whitespace из колонок (template literals с `\n` ломали запросы)
- `.select()` после `.insert()/.update()/.delete()` НЕ меняет HTTP метод (проверка `if (_method === 'GET')`)
- Паттерн взят из `supabase/postgrest-js` (GitHub open source)
- НЕ нужно декодить `%28` обратно — просто не энкодить изначально


# ===== FILE: tech-debt.md =====

---
name: Technical debt
description: Технический долг проекта — дублирование, недоделки, cleanup
type: project
---

# Technical Debt

## Планувальник (Planner) — дублирование утилит (2026-03-20, актуально)

### Средний приоритет — дублирование
- [ ] `weekDates()` — 3 копии (`calendar-entries.ts`, `calendar-shared.ts`, `weekly-suggest-strategies.ts`) — использовать экспорт из `calendar-shared.ts`
- [ ] `timeToMinutes()` — 3 копии (`calendar-entries-write.ts`, `PlannerBlocks.tsx`, skill workspace) — вынести в `calendar-shared.ts`
- [ ] `minToTime()` / `minToTimeStr()` — 2 копии (`weekly-suggest-strategies.ts`, `planner-helpers.ts`) — вынести в `calendar-shared.ts`
- [ ] `getUserOid()` (teams_aad_oid lookup) — inline в 7+ API routes — `getTeamsOid(db, userId)` helper в `lib/shared/`
- [ ] `GRAPH_BASE` — 3 места вне planner (`graph/calendar-write.ts`, `graph/meetings.ts`, `graph/auth-service.ts`) — единый экспорт из `graph/client.ts`

## Plans V2 — доработка (2026-04-02, актуально)

### Высокий приоритет
- [ ] Удалить deprecated файлы: `MonthlyProcessView.tsx` (в plans/v2/)
- [ ] Редактирование месячного плана (ProcedureDetailPanel edit mode — компании, часы, assignees)
- [ ] V1 код — обновить старые статусы (draft/approved/completed -> pending/active/done) или удалить status-commands.ts legacy матрицу

### Средний приоритет
- [ ] Обновить `.claude/rules/glossary.md` — ссылки на удалённые Plans V1 файлы (service-core, read, write, delete, quarterly-fetcher, monthly-mappers)

## MSAL Auth — pending Azure AD config (2026-04-02, актуально)

### Высокий приоритет — не будет работать без регистрации
- [ ] Зарегистрировать `https://maxtitan.me/blank.html` в Azure AD → App Registration → Redirect URIs
- [ ] Зарегистрировать `https://maxtitan.me:8080/blank.html` (дев) там же
- **Контекст:** добавлен `public/blank.html` для silent token в iframe (fix `monitor_window_timeout`), `iframeHashTimeout: 15000` в MSAL config

### Выполнено (2026-04-01)
- [x] Query optimization: 17 roundtrips -> ~8 (merged overview view, RPC get_plan_details, explicit SELECT)
- [x] processesQueryOptions — PostgREST FK join вместо 2 запросов
- [x] V1 plans components + hooks полностью удалены (PlansContent, PlanTreeContent, PlanDetailsPanel, etc.)
- [x] Legacy RPC dropped: get_all_annual_plans, get_all_quarterly_plans, manage_quarterly_plan, audit_quarterly_plans

## Ініціативи — CRUD + зв'язок з задачами (2026-03-26, актуально)

### Високий пріоритет — функціонал неповний
- [ ] CRUD ініціатив (створення, редагування, видалення, зміна статусу)
- [ ] Зв'язок ініціативи -> задачі (зараз нема прямого FK, фільтруємо по статусу)
- [ ] Можливість прив'язати ініціативу до процедури/задачі

### Де відображаються ініціативи:
- `ProcessDetailView.tsx` — деталі процесу (рік: не показує, квартал: всі, місяць: тільки in_progress/completed)
- `QuarterlyListView` (QuarterlyViews.tsx) — список квартальних планів (точки статусу під назвою процесу)
- `ProcedureDetailPanel.tsx` -> ProcedureView — деталі процедури (секція "Ініціативи")

## External events в collect (2026-03-20, актуально)

### Средний приоритет — нужна доработка
- [ ] External entry + task_template_id -> как попадает в collect
- [ ] External не имеет monthly_plan_id -> при collect нужно брать plan от выбранной процедуры в sidebar
- [ ] Кнопка collect в sidebar считает только source='plan' entries — external с шаблоном не учитываются

## Graph Webhook — calendar change notifications (2026-03-20, не начато)

### Низкий приоритет — nice-to-have
- [ ] `POST /api/calendar/webhook` — endpoint для приёма notifications от Microsoft Graph
- [ ] `lib/ops/planner/calendar-webhook.ts` — создание/обновление subscription
- [ ] При notification — ставить `outlook_modified = true` на entries
- [ ] Subscription scope: `/users/{oid}/events`, expiration 3 дня, обновление при Pull

## UI дизайн — переработка модалов (2026-03-18, актуально)

### Средний приоритет
- [ ] Переработать CalendarMeetingModal под дизайн demo-design3.html — meeting info + AI summary

## Скиллы и агенты — cleanup (2026-03-10, актуально)

### Высокий приоритет
- [ ] Заменить плагинный `frontend-design` на свой проектный скилл — конфликтует с glassmorphism + slate

### Средний приоритет
- [ ] `api-patterns` скилл дублирует CLAUDE.md — решить: убрать дубли из CLAUDE.md или наоборот
- [ ] Скиллы `testing`, `git-workflow` — не протестированы через skill-creator

## Выполнено (архив)

### Великий Календар -> Планувальник (завершено 2026-03-19)
- [x] Весь модуль извлечён из Cabinet в `lib/ops/planner/` — 15 сервисов, 15 routes, 15 компонентов
- [x] Все старые файлы `cabinet/weekly-planner/*`, `WeeklyPlanner*.tsx` — удалены
- [x] `calendar-sync.ts` 403->218 строк, `calendar-push.ts` 338->291 строк — в пределах лимитов
- [x] Архитектура `task_template_id` — решена и реализована
- [x] `entryStatus()` — обновлён (7 статусов: collected/returned/templated/modified/synced/external/distributed)
- [x] `collect-tasks.ts` — группировка по `task_template_id`, создание daily_task
- [x] `GRAPH_BASE` в planner — unified через `calendar-shared.ts`
- [x] Все агенты/скиллы исправлены (api-route, db-analyst, reviewer, descriptions, Context7)
- [x] `service_prompt` — удалена колонка из `procedures`, view `v_kpi_operational` (+ dependent views), RPC `manage_procedure`, 8 файлов кода

### Plans V1 -> V2 migration (завершено 2026-04-01)
- [x] V1 components полностью удалены (PlansContent, PlanTreeContent, PlanDetailsPanel, PlanTileCard, Tasks/, details/, tree/)
- [x] V1 hooks удалены (usePlans, usePlanOperations, usePlanCopy, planning/*)
- [x] V1 service files удалены (read, write, delete, service-core, quarterly-fetcher, plan-factories, monthly-mappers, etc.)
- [x] V2 architecture: plans.queries -> plans.query-options -> plans.mappers (чистое разделение)
- [x] RPC get_plan_details — 10 detail roundtrips -> 1

### Plans V2 + Planner стандартизация (завершено 2026-04-01)
- [x] Shared components extracted: `components/dashboard/shared/` — ThreePanelLayout, PanelFooter, StatusIcons, SourceBadge, UserAvatar
- [x] useResizablePanels hook для drag-to-resize с конфігурованими лімітами
- [x] Мобільний вид Plans V2 (FAB Процеси/Працівники), PlansV2Content 350→195 рядків
- [x] Planner sidebar → element-card + footer, calendar stats footer, PlannerStats зону видалено
- [x] -627/+298 рядків (22 файли), ~330 рядків дублікатів видалено

### Docs cleanup — strategy consolidation (завершено 2026-04-02)
- [x] Obsolete docs удалены: PLANSV2_PLANNER_TARGET_MODEL, POLICY_PROCESS_MATRIX, PROCESS_TARGET_MAP_AND_ROADMAP, REFACTORING_PROPOSAL, SOC_KPI_IDEAS, modules/auth, modules/projects, old plan docs
- [x] Consolidated into `docs/STRATEGY_PLANS_KPI.md`
