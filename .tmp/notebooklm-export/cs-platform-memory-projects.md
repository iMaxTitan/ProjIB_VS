

# ===== FILE: project-company-context.md =====

---
name: Company & KB Domain Context
description: Компания — национальный ретейл Украины. БЗ содержит юридические документы для ретейла + внутреннюю документацию.
type: project
---

Компания — **национальный ретейл Украины** (крупная сеть).

**База знаний (KB) содержит:**
- Юридические документы, релевантные для ретейл-бизнеса и его сотрудников (мобилизация, трудовое право, регуляторка)
- Внутренняя документация компании (процедуры, инструкции, политики)

**Why:** Контекст домена критичен для оценки качества RAG — eval-датасет должен содержать вопросы из ретейл-юридической тематики, а не generic ZNO/Wikipedia.

**How to apply:** При работе с KB/RAG учитывать специфику: сотрудники задают вопросы о трудовом праве, мобилизации, бронировании, внутренних процедурах. Eval-вопросы должны быть из этого домена.


# ===== FILE: project-kb-denisov-feedback.md =====

---
name: KB feedback from Denisov (2026-03-30)
description: Employee feedback on KB quality — missing court practice, weak cross-document responsibility search
type: project
---

Обратная связь от сотрудника Денисова по использованию БЗ (2026-03-30):

1. **Законодательство базово подходит**, но нужна судебная практика — без неё непонятно, что куда применять.
2. **Общий вопрос про ответственность** — БЗ сначала не учла законодательство, только по конкретному вопросу перешла к нему. Нужно улучшить связку "тема → релевантные статьи закона".
3. **Положення про комтайну** — есть раздел с ответственностью (статьи УК, КУоАП), но поиск туда не заглянул. Проблема чанкинга или поиска по разделам внутренних документов.

**Why:** Первый реальный user feedback на качество KB от юриста. Показывает gaps в RAG pipeline.
**How to apply:** При доработке KB search/synthesizer учитывать эти кейсы. Судебная практика — отдельное решение по контенту.

### Исправлено (2026-03-30)
- SQL `match_kb_documents`: добавлено `OR cat.slug = 'legal'` — legal-документы (законы) теперь всегда доступны при поиске, даже когда category filter = ib/hr/it.
- Это решает проблемы 1 и 2 (не подтягивались статьи УК/КУпАП при ib-запросах).

### Открыто
- НПК (научно-практичні коментарі до УК) — Денисов предлагает добавить для объяснения применения норм. Решение по контенту не принято.


# ===== FILE: project-kb-eval-baseline-2026-03-30.md =====

---
name: KB Eval Baseline 2026-03-30
description: Baseline eval metrics after prefix pipeline L1/L2 + synonym dict + scope filter + audience filter + Gemini extract
type: project
---

# KB Eval Baseline — 2026-03-30

## Pipeline
- Prefix: L1 Gemini Flash-Lite (99%) + L2 Haiku fallback
- Synonym dict: kb_synonym_dict (23 entries)
- Scope: DB column, title-only rule engine, AI primary
- Search: vector+BM25 RRF → scope filter → Voyage rerank-2.5 → audience filter
- Extract: Gemini Flash-Lite (fallback Haiku)
- Compose: Haiku 4.5
- Embedding: voyage-4-large (both index and query)

## Metrics (20 test cases, 7 with gold chunks)
| Metric | Value | Target |
|--------|-------|--------|
| Recall@10 | 0.714 | ≥0.90 |
| MRR@10 | 0.357 | ≥0.70 |
| WrongScope@3 | 1/20 | 0 |
| KeywordHit | 0.908 | ≥0.80 ✅ |
| NegativeHit | 0/20 | 0 ✅ |
| Refused | 4/20 | — |
| Cost | $0.045 | (6x cheaper than Haiku-only $0.26) |

## Problem areas
- booking-docs: R=0.00 — gold chunk not in top10 (reranker issue)
- booking-priests: R=0.00 — gold chunk IDs may need update
- border-reserved: WS=0.67 — wrong scope chunks in retrieval (synthesis filters them)
- winrar: KW=0.00 — keyword "ліцензі" not in answer text

## DB stats
- Total chunks: 9114, all prefix_status=ok
- Documents: 60+ (5 codexes + laws + internal policies)

## Next: reranker tuning (P1)
- Format reranker input with explicit scope/audience/norm_type fields
- Tune NOISE_THRESHOLD
- Boost general norms over exceptions


# ===== FILE: project-kb-legal-locator.md =====

---
name: KB Legal Locator — next step
description: Детерміністичний пошук по номеру статті/пункту закону. Regex parsing → SQL lookup → top-1 inject. Наступна задача.
type: project
---

# Legal Locator — пошук за номером статті

## Проблема
Запит "стаття 11 Закону Про інформацію" не знаходить потрібний чанк.
Причина: embedding "стаття 11" семантично близький до будь-якої статті, BM25 матчить "стаття" всюди.
Чанк EXISTS (bb2926aa, heading="Стаття 11. Інформація про фізичну особу").

## Рішення (від критика GPT-5.3)
Детерміністичний sub-query **до** гібридного пошуку:

1. Regex parse запиту: `стаття|ст.|пункт|п.` + номер + назва акту
2. Нормалізація аліасів: `КЗпП` → `Кодекс законів про працю`
3. SQL lookup: `heading ILIKE '%Стаття 11%'` + `document_title ILIKE '%Про інформацію%'`
4. Match → inject як top-1 з max priority
5. No match → звичайний pipeline

## Файли
- `src/lib/kb/search.ts` — додати `legalLocator()` перед основним pipeline
- Можливо нова RPC або просто PostgREST select

## Покриває
- "стаття 11 закону про інформацію"
- "ст. 25 КЗпП"
- "пункт 3 постанови 76"
- "стаття 197 ПКУ"


# ===== FILE: project-kb-reranker-plan.md =====

---
name: KB Reranker Tuning Results
description: Результати тюнінгу reranker 2026-03-30. Scope soft boost, candidate recall, keyword rescue. Shipped.
type: project
---

# Reranker Tuning — Результати (2026-03-30)

## Що зроблено і shipped

1. **Scope filter: hard drop → soft boost** (×0.5 penalty на similarity)
   - Файл: `src/lib/kb/search.ts` — `applyScopeBoost()`
   - Виправлено: booking-priests (UA морфологія ламала stem-match)

2. **Candidate recall**: MATCH_COUNT 15→50, MATCH_THRESHOLD 0.20→0.10

3. **Two-stage rerank**: RERANK_FETCH_K=50 (Voyage), RERANK_KEEP_K=30 (після boost)

4. **Dynamic MAX_PER_DOC**: base 2, +1 якщо score gap ≤0.02
   - Файл: `src/lib/kb/search-helpers.ts` — `diversifyByDocument()`

5. **Keyword rescue**: правила в коді для критичних entity-матчів
   - winrar/архіватор → peazip, teams, acrobat
   - Файл: `src/lib/kb/search.ts` — `keywordRescue()`

## Що спробували і відкинули

- **Structured [META]/[SECTION] tags** — катастрофа (Voyage rerank-2.5 не розуміє)
- **Короткі domain instructions** — регресія booking-docs-ru
- **Post-rerank scope penalty** — неефективно (wrong-scope = general)
- **Entity boost** — шкодить legal (всі чанки +0.16), корисний тільки для IT/IB
- **Gemini 3 Flash compose** — дешевше на 55%, але коротші/менш детальні відповіді

## Метрики

| Metric | До | Після | Target |
|--------|-----|-------|--------|
| Recall@10 | 0.714 | **0.929** ✅ | ≥0.90 |
| MRR@10 | 0.321 | **~0.45-0.57** | ≥0.70 |
| KeywordHit | 0.829 | **~0.85-0.91** ✅ | ≥0.80 |

MRR нестабільний на 7 gold кейсах — потрібно 50+ для надійних висновків.

## Наступні кроки
- Розширити gold test cases до 50+
- Перенести keyword rescue правила в `kb_synonym_dict`
- Intent-aware tie-breaker для WrongScope (border/priest)

## Запуск eval локально
```bash
ssh -i ~/.ssh/id_nas -f -N -L 8443:localhost:3000 root@46.225.234.164
# .env.local: POSTGREST_URL=http://localhost:8443
POSTGREST_DIRECT=1 npx tsx scripts/kb-eval.ts --verbose
```


# ===== FILE: project-planner-audit-2026-03-19.md =====

---
name: planner-audit-2026-03-19
description: Planner module deep audit — all changes, target flows, decisions, and remaining TODOs from 2026-03-19 session
type: project
---

## Planner Module Audit (2026-03-19) — Summary of Changes & Decisions

Full audit doc: **docs/plans/2026-03-19-planner-audit.md**

### Key Changes Made

**Plans sidebar:**
- Badge shows `departmentCode`, color depends on plan status (violet=active, green=completed)
- Sorting: active first, completed below, alphabetical by procedure name (uk locale)
- Completed plans: `opacity-70`, `cursor:default`, drag disabled, collect hidden
- All entries/tasks for completed plans = read-only (no drag/resize/delete/add/edit)
- Empty state: "Немає планів на цей період"

**Calendar & Collect:**
- Collect creates `task_type: 'incomplete'` (NOT 'completed') — tasks go to Tasks section for approval flow
- Collect includes linked external entries (not just plan)
- Collect API accepts `title` + `companyIds` from UI
- FK `weekly_calendar_entries.daily_task_id` → ON DELETE SET NULL — deleting task auto-unlocks entries
- TaskPicker for external events filters out completed plans

**Tasks:**
- Assign draft → `incomplete` (NOT `pending_approval`); button title "Прив'язати до плану"
- TemplateList endpoint: `/api/planner/templates` (old `/api/cabinet/task-templates` deprecated)

**Sync (PULL/PUSH):**
- BUG FIX: PULL external entries query now filtered by week (`gte/lte date`)
- BUG FIX: backfillMissingSubjects now scoped to week
- detectRemovedEntries now correctly only checks current week entries

**Header/Toolbar:**
- Title removed (TODO: day/week toggle for mobile)
- Lunch dropdown: click-outside handler added
- Button styles: disabled=pressed+dim, normal=slate-500, hover=raised+glow, accent=soft glow
- cal-action-btn CSS: disabled translateY(0.5px) + inset text-shadow, hover translateY(-0.5px) + drop-shadow

**Sync bugfixes:**
- PULL external entries + backfill subjects — scoped to week (was loading ALL weeks)
- Transcript "не доступен" — API always checks Graph (was skipping when has_transcript=false)
- UI uses info.hasTranscript from Graph response (not stale entry.has_transcript)

**Meeting modal:**
- AI model: `claude-3-haiku-20240307` → `claude-haiku-4-5-20251001`
- Graph helpers: meeting-details + meeting-summary import GRAPH_BASE from calendar-shared
- Collect pre-fill: external entry subject → title, transcript_summary → description (HTML stripped)

**Cleanup:**
- Deleted `TasksPanel.tsx` (dead component, never rendered)
- Deleted `/api/planner/drafts/suggest` (AI suggest for drafts — obsolete)
- Deleted `useSuggestDrafts` + `DraftSuggestion` from hooks
- Bot `draft-task.ts`: message updated "у планувальнику" instead of "у кабінеті"

### Target Flows (agreed)

**Calendar flow:**
1. Load week → PULL from Outlook
2. Manual drag or AI Suggest slots
3. Unsync'd → pulsing dot → PUSH to Outlook → synced
4. External events → link to plan/task via picker
5. Outlook changes → PULL → marks modified
6. Collect: all entries (plan + linked external) → one incomplete task
7. Collected entries → read-only; delete task → unlock (FK SET NULL)
8. Further task work in Tasks section, not calendar

**Task flow:**
1. Tasks panel visible only when plan selected
2. Shows plan tasks + unlinked drafts
3. Click draft → modal → link to plan → `incomplete`
4. "На узгодження" button for incomplete → `pending_approval`
5. Manager: approve (`completed`) or reject (`rejected`)
6. Completed plan doesn't block tasks — unapproved just excluded from KPI/reports

### Remaining TODOs

- entryStatus() + calendar colors/statuses — needs design work
- LEGEND_ITEMS — sync with real statuses
- Stats: `weeklyCapacity=32` hardcode → `work_rate * 40`; context-aware (selected plan vs all)
- Header: day/week toggle (mobile must-have)
- GhostBlock: inline styles → CSS classes
- Old `/api/cabinet/task-templates` endpoint — delete
- Meeting modal UI — redraw in design system style (glass-panel, element-card)
- Mobile UX audit

### All 8 sub-modules audited (2026-03-19):
1. Plans sidebar ✓
2. Calendar grid ✓
3. Tasks (detail, picker, modal) ✓
4. Header/Toolbar ✓
5. Stats ✓ (TODOs noted)
6. Drafts panel ✓ (deleted dead code)
7. Sync logic ✓ (bugfixes)
8. Meeting modal ✓ (bugfixes + AI model update)


# ===== FILE: project-planner-tasks-redesign.md =====

---
name: Planner Tasks Panel Redesign
description: Redesign tasks panel in Planner — Plan2-style task list per procedure, no quick input, bot creates drafts
type: project
---

Редизайн панелі задач у Планувальнику — замінити поточну "Мої задачі" на detail-panel у стилі Plan2.

**Why:** Поточна панель (черновики + незавершені) марна — "незавершені" це просто записи без збору, quick input дублює бота. Потрібна повноцінна робота з задачами прямо в планувальнику, щоб повністю вивести задачі з модуля Плани.

**How to apply:**

## Рішення (2026-03-18)

### Коли процедура вибрана → панель показує задачі плану:
- **Задачі від CHIEF/HEAD** — зверху з бейджем джерела (CHIEF/HEAD)
- **Власні задачі** — нижче, з checkbox (done/pending)
- **Дії:** checkbox завершити, редагувати, видалити, відправити на апрув хеду (📤)
- **Header:** місяць + назва процедури + статус + години actual/planned + [+] [×]
- **Footer:** "Разом N/M задач · X год"

### Коли процедура НЕ вибрана → панель прихована (ніяких чернетків)

### Чернетки (drafts):
- Створюються через бота → без процедури
- Показуються в панелі задач КОЛИ вибрана процедура
- Клік на чернетку → одразу прив'язується до вибраної процедури (monthly_plan_id вже відомий)
- Не потрібен select/dropdown — той самий flow що на плитках календаря (клік → picker → прив'язка)
- Quick input ВИДАЛЕНИЙ — тільки через бота

### Дизайн (з demo-design3 Plan2):
- `.detail-wrap` → `.detail-summary-hdr` → `.tasks-scroll` → `.summary-row`
- `.pp-task-row` з `.pp-task-check` (done/pending)
- `.row-actions` з `.action-btn-small` (edit, delete)
- Без групування по співробітникам (один користувач)

### Потрібно створити:
1. API: `/api/planner/tasks?monthly_plan_id=X` (задачі з source info)
2. Hook: `usePlannerTasks(monthlyPlanId)`
3. Компонент: `PlannerTasksDetail` (замість TasksPanel)
4. PlannerContent: показувати панель тільки коли вибрана процедура
5. CSS класи вже є в globals.css (pp-task-row, pp-task-check, detail-wrap, etc.)


# ===== FILE: project-quarterly-projects.md =====

---
name: quarterly-projects-decision
description: Решение по квартальным проектам — новая сущность, привязка через задачи, кросс-департамент
type: project
---

Квартальные проекты — одобрено руководством 2026-03-20.

**Суть:** Крупные проекты выделяются в квартальном плане. Проект привязан к процессу через quarterly_plans. Процедуры НЕ привязываются к проекту явно (вариант С) — сотрудник помечает задачу проектом при создании.

**Схема БД:**
- `quarterly_projects` (NEW): id, quarterly_id → quarterly_plans, project_id → projects, goal, planned_hours
- `daily_tasks.project_id` — уже существует, используется как есть

**KPI:** не меняется, часы агрегируются по процессу.
**Отчётность:** два разреза — по процессу (KPI) и по проекту (часы/сотрудники/отделы).
**Кросс-департамент:** проект может охватывать несколько отделов через процедуры разных процессов.

**План-документ:** `docs/plans/2026-03-20-quarterly-projects-plan.md`

**Why:** Нужна видимость крупных проектов в квартальном плане и отдельная отчётность по ним, без дублирования часов в KPI.

**How to apply:** При реализации — минимум изменений: одна новая таблица, UI квартального плана + выбор проекта при создании задачи.


# ===== FILE: project-reindex-pending.md =====

---
name: KB reindex and prefix status
description: Reindex 20/20 юридичних документів DONE, contextual prefix 5179/5179 DONE (2026-03-25)
type: project
---

## DONE (2026-03-25)

### Reindex юридичних документів — 20/20
- Enriched embeddings з docMeta (doc_type, doc_number, parent_law)
- Баг extractNreg (обрізав шлях після `/`) — виправлено

### Contextual prefix generation — 5179/5179
- 4488 нових prefix згенеровано, 0 помилок
- Паралельний скрипт (CONCURRENCY=10) замість sequential

### На потім
- docMeta для ІБ/HR/IT документів (проставити metadata → reindex)


# ===== FILE: project-strategy-gaps-2026-04-02.md =====

---
name: Strategy vs Implementation gaps (2026-04-02)
description: Сравнение стратегии STRATEGY_PLANS_KPI.md с текущей реализацией — что есть, чего нет
type: project
---

Анализ проведён 2026-04-02 совместно с Codex. Документ стратегии: `docs/STRATEGY_PLANS_KPI.md`.

## Что есть и работает (~60-65% стратегии)

- **Процессы:** 13 шт, таблица `processes`, связь с процедурами и KPI
- **Процедуры:** 88 шт, привязаны к процессам, категории (strategic/process/operational)
- **Шаблоны задач:** `procedure_task_templates` (id, procedure_id, title, content, is_active)
- **daily_tasks:** 21 587 задач, поля: source, task_type, project_id, spent_hours, distribution_type
- **Инициативы:** `quarterly_plan_initiatives` (id, quarterly_plan_id, title, description, status) — только квартальные
- **Планы (3 уровня):** annual → quarterly → monthly, полная иерархия
- **KPI:** агрегация overall, byProcess, byEmployee, byDepartment, trends. Формула: actual/planned×100
- **Assignees:** M:N таблица `monthly_plan_assignees` (без доли ресурса, часы делятся поровну)

## Чего нет (gaps)

| Gap | Где нужно | Что сейчас |
|-----|-----------|------------|
| `work_mode` (planned/unplanned) | templates + daily_tasks | ❌ нет |
| `work_type` (monitoring, audit...) | templates + daily_tasks | ❌ нет, используется `source` (manual/template/manager) |
| `source_type` (procedure/initiative) | daily_tasks | ❌ нет |
| `execution_type` (cyclic/project) | daily_tasks | ❌ нет |
| `template_id` FK в daily_tasks | daily_tasks → templates | ❌ шаблон используется при создании, но связь НЕ сохраняется |
| Allocation (доля ресурса) | monthly_plan_assignees | ❌ нет поля %, часы делятся поровну |
| Годовые/месячные инициативы | annual_plans, monthly_plans | ❌ только quarterly |
| Capacity из аллокаций | KPI | ❌ capacity = work_rate × норма, без привязки к процедурам |

## Ключевые архитектурные решения из обсуждения

1. **Процессы и политики СУІБ — независимые сущности.** Связь методологическая (маппинг покрытия), не иерархическая
2. **Инициативы — change-path внутри процесса** (не процедура). Каскадируются: год → квартал → месяц
3. **KPI процессный** — инициатива привязана к процессу, часы идут в тот же котёл. 40ч/нед потолок
4. **Минимум ввода для сотрудников** — все классификационные поля auto-inherited от шаблона
5. **Все схемы в Mermaid** — тёмная тема, VS Code preview

## Что обновлено в стратегии

- Верхнеуровневая модель: два контура (routine + change), 4 Mermaid-схемы
- 10 архитектурных правил модели
- Типизация задач: 4 оси (source_type, execution_type, work_mode, work_type)
- Процедура как единица исполнения (не папка шаблонов)
- Assignment vs Allocation — участие ≠ доля ресурса

**Why:** Нужна полная картина для планирования следующих шагов реализации.

**How to apply:** При продолжении работы — начинать с этого файла, не пересканировать всё заново.


# ===== FILE: project-template-drag-idea.md =====

---
name: Template drag-to-calendar idea
description: Drag task template from right panel to calendar slot to create calendar entry via drag & drop
type: project
---

Идея: drag & drop шаблона задачи из правой панели (PlannerTasksDetail) в слот календаря (PlannerGrid).

**Механика:**
- Процедура уже выбрана → monthly_plan_id известен
- Шаблон перетаскивается (drag) из TaskGroup "Шаблони задач" → drop на слот в PlannerGrid
- Создаётся calendar entry с duration из шаблона (spent_hours → минуты)
- Только calendar entry, НЕ daily_task
- Аналогично TaskPickerDropdown на плитке, но через drag & drop вместо dropdown

**Why:** Ускоряет заполнение календаря — один drag вместо клика + модалки. TaskPickerDropdown ставит задачу через dropdown, а тут drag & drop ставит задачу в плитку календаря.

**How to apply:**
- Добавить draggable на шаблоны в TaskGroup (новый drag type "template")
- Drop target уже есть в PlannerGrid (расширить для нового типа)
- При drop → POST /api/planner/entries с monthly_plan_id + date/start_time из слота + duration из шаблона


# ===== FILE: rag-search-architecture.md =====

---
name: RAG Search Architecture
description: Повна архітектура пошуку в базі знань — pipeline, методи, інструменти, best practices для юридичних документів
type: reference
---

# RAG Search Architecture — CS Platform KB

## Pipeline пошуку (search.ts)

```
Запит користувача
    │
    ▼
1. Multi-query generation (GPT-4o-mini)
   → 2-3 перефразування + визначення домену (ib/hr/it/legal/general)
   → Юридичні синоніми: "бронювання" → "відстрочка від призову"
    │
    ▼
2. Batch embedding запитів (Voyage multilingual-2)
   → Всі sub-queries одним API call
    │
    ▼
3. Vector search (pgvector, match_kb_documents RPC)
   → Кожен sub-query → top-N чанків по cosine similarity
   → Category filter якщо domain визначено
   → Fallback з нижчим threshold якщо 0 результатів
    │
    ▼
4. Merge + deduplicate
   → Об'єднання результатів всіх sub-queries
   → Видалення дублів по chunk ID
    │
    ▼
5. Quality gate
   → Мінімальний similarity threshold
    │
    ▼
6. Rerank (Voyage reranker)
   → Cross-encoder scoring по оригінальному запиту
   → Top-8 після rerank
    │
    ▼
7. Post-rerank diversify
   → Max 2 чанки з одного документа (щоб не домінував один doc)
    │
    ▼
8. Expand neighbors (±1 chunk)
   → Для кожного чанка підтягнути сусідні чанки з того ж документа
    │
    ▼
9. Cross-reference expansion ← НОВИЙ (2026-03-25)
   → Якщо документ має parent_doc_id або related_docs
   → Vector search top-4 чанків зі зв'язаних документів
   → Додає контекст з батьківського закону до постанови
    │
    ▼
10. AI Synthesis (Claude Haiku / GPT-4o-mini)
    → System prompt з категорійним суфіксом (legal/ib/hr/it)
    → Структурована відповідь: коротка → деталі → важливо знати
    → Посилання на джерела: 📄 «Назва», Стаття X
```

## Збагачення даних при індексації

### Chunking (chunker.ts)
- Parent-child chunking по заголовках (##, ###)
- MIN_CHUNK_TOKENS = 100, MAX_CHUNK_TOKENS = 1500
- Таблиці конвертуються окремо

### Contextual Prefix (contextual-prefix.ts)
- GPT-4.1-mini генерує 2-3 речення контексту для кожного чанка
- Передає title + summary документа + heading + chunk content
- КРИТИЧНО для retrieval якості — без prefix чанки "невидимі"
- Skip на rate limit (не блокує import)

### Enriched Embedding (buildContextualContent) ← НОВИЙ (2026-03-25)
```
Embedding text = docMeta (тип, номер, батьківський закон, зв'язки)
              + категорія + назва документа + розділ
              + contextual prefix (якщо є)
              + chunk content
```
Для юридичних: "Тип: Постанова КМУ 76-2023-п. На виконання: 3543-XII — Про мобілізацію."
Для ІБ/HR/IT: поки без docMeta, але архітектура готова.

## Зв'язки між документами (metadata)

```json
{
  "doc_type": "Постанова КМУ",
  "doc_number": "76-2023-п",
  "source_url": "https://zakon.rada.gov.ua/laws/show/76-2023-п",
  "parent_doc_id": "uuid-закону-3543-XII",
  "related_docs": ["uuid-КМУ-560", "uuid-КМУ-1487"],
  "fetched_at": "2026-03-25"
}
```

Використовується:
- **UI** — таблиця-дерево (parent → children)
- **Cross-ref retrieval** — підтягує чанки з батьківського/зв'язаних документів
- **Enriched embedding** — doc_type + parent_law в embedding тексті

## Ієрархія юридичних документів

```
Конституція України (найвища юридична сила)
  └── Міжнародні конвенції (ратифіковані)
  └── Закони України (загальні норми)
      └── Постанови КМУ (конкретний порядок, правила)
          └── Накази міністерств (критерії, регламенти)
              └── Зміни до вищестоящих актів
```

## Synthesizer промпти (synthesizer.ts)

Категорійні суфікси:
- **legal** — ієрархія документів, цитування статей/пунктів, дисклеймер zakon.rada.gov.ua
- **ib** — дружній тон, покрокові дії, обмеження
- **hr** — процедури, строки, відповідальні
- **it** — інструкції, технічні терміни

## Інструменти

| Компонент | Інструмент | Призначення |
|-----------|-----------|-------------|
| Embedding | Voyage multilingual-2 (1024d) | Векторизація чанків і запитів |
| Reranking | Voyage reranker | Cross-encoder scoring |
| Multi-query | GPT-4o-mini | Перефразування + domain detection |
| Contextual prefix | GPT-4.1-mini | AI-контекст для кожного чанка |
| Synthesis | Claude Haiku 4.5 | Генерація відповіді з чанків |
| Vector DB | PostgreSQL 16 + pgvector | Cosine similarity search |
| Law fetcher | data.rada.gov.ua API + Playwright fallback | Завантаження законів |

## Best Practices (з Graph RAG for Legal Norms, 2025)

1. **Summary Augmented Chunks** — metadata в embedding тексті
2. **Cross-reference retrieval** — автоматичне підтягування зв'язаних документів
3. **Temporal versioning** — datred поле для перевірки актуальності
4. **Structure-aware retrieval** — ієрархія heading → section → document
5. **Multi-aspect embeddings** — різні "лінзи" на документ (поки не реалізовано)
6. **Deterministic query expansion** — doc_numbers замість AI-галюцинацій
