

# ===== FILE: reference-mcp-servers.md =====

---
name: MCP servers configuration
description: Список активных MCP серверов проекта и где они настроены
type: reference
---

## Активные MCP серверы (на 2026-03-31)

| Сервер | Источник | Назначение |
|--------|----------|------------|
| **postgres** | `.mcp.json` (project) | Прямые SQL запросы к PostgreSQL через WireGuard (10.77.1.2:5432) |
| **Context7** | плагин `context7@claude-plugins-official` | Документация библиотек (React, Next.js и т.д.) |
| **Microsoft Learn** | плагин `microsoft-docs@claude-plugins-official` | Документация Microsoft/Azure |
| **Playwright** | плагин `playwright@claude-plugins-official` | Браузерная автоматизация, E2E тесты |
| **Telegram** | плагин `telegram@claude-plugins-official` | Telegram бот интеграция |

## Удалённые

| Сервер | Дата | Причина |
|--------|------|---------|
| **Supabase** (`supabase@claude-plugins-official`) | 2026-03-24 | Не используется, проект на прямом PostgreSQL + PostgREST |
| **Stitch** (Google) | 2026-03-31 | Ни разу не использовался в реальной работе |

## Где настроены

- **Project MCP:** `.mcp.json` — postgres
- **Плагины:** `~/.claude/settings.json` → `enabledPlugins`
- **Project permissions:** `.claude/settings.local.json` → `enableAllProjectMcpServers: true`


# ===== FILE: reference-model-benchmarks.md =====

---
name: Model benchmarks for KB prefix generation
description: Результати тестування моделей для генерації structured prefixes [Пошук:][Тип:][Стосується:] — порівняння якості, швидкості, ціни
type: reference
---

# Тестування моделей для prefix generation

Задача: генерація structured search index entry для чанків юридичних документів.
Формат: `[Пошук:][Тип:][Стосується:]` + 1-2 речення контексту.
Тестовий документ: Постанова КМУ 76 (бронювання).

## Результати — API моделі через OpenRouter (2026-03-29, 5 чанків)

| Модель | $/M in/out | Формат | Суржик | [Стосується:] | [Тип:] | Час | $/5K чанків |
|--------|-----------|:---:|:---:|:---:|:---:|:---:|:---:|
| **Claude Haiku 4.5** | $0.80/$4.00 | **5/5** | **✅✅** | **Конкретно, ролі** | **Комбінації** | 3.4с | $14.00 |
| **Gemini 3 Flash** | $0.50/$3.00 | **5/5** | **✅✅** | **Конкретно, ролі (HR)** | Комбінації | 2.1с | $9.75 |
| GPT-5.4 Mini | $0.75/$4.50 | **5/5** | **✅✅** | Детальний | Точний | 2.0с | $13.50 |
| **Gemini 3.1 Flash-Lite** | $0.25/$1.50 | **5/5** | **✅✅** | **Конкретно (HR, кадри)** | Добрий | 2.0с | **$3.38** |
| Gemini 2.5 Flash | $0.30/$2.50 | **5/5** | ✅ | Конкретно | Спрощений | 1.3с | $7.25 |
| **GPT-5.4 Nano** | $0.20/$1.25 | **5/5** | ✅ | **Детальний (ролі АТБ)** | Інколи невірний | **2.2с** | **$1.80** |
| Grok 4.1 Fast | $0.20/$0.50 | **5/5** | ✅ | Детальний | Спрощений | 8.3с | $1.50 |
| Grok 4 Fast | $0.20/$0.50 | **5/5** | ✅ | Детальний | Спрощений | 7.7с | $1.50 |
| GPT-4o-mini | $0.15/$0.60 | **5/5** | ✅ | Детальний | Generic | 4.1с | $2.33 |
| Gemini 2.0 Flash | $0.10/$0.40 | **5/5** | Частково | Generic | Інколи невірний | 1.8с | **$1.15** |
| **Qwen3 235B MoE Jul** | **$0.07/$0.10** | **5/5** | **✅✅** | Конкретно | Добрий | 25с ⚠️ | **$0.73** |
| Qwen3.5 Flash | $0.07/$0.26 | **5/5** | ✅✅ | Конкретно (HR, бух.) | Спрощений | 42с ❌ | $0.78 |
| DeepSeek V3.2 | $0.26/$0.38 | **5/5** | ✅ | Коротший | Одноманітний | 9.5с ❌ | $1.15 |
| Amazon Nova Micro | $0.04/$0.14 | 4/5 | Частково | Конкретно | Комбінації | **1.9с** | **$0.44** |
| Llama 4 Scout | $0.08/$0.30 | 3/5 ❌ | ✅ | Короткий | Неточний | 2.0с | $0.72 |
| MiniMax M2.7 | $0.30/$1.20 | 1/5 ❌ | - | - | - | 6.5с | - |
| Mistral Small 3.1 | $0.03/$0.11 | 3/5 | Частково | Конкретно | Generic | 60с ❌ | $0.27 |

## Результати — Self-hosted моделі (2026-03-29, 3 чанки)

| Модель | Розмір | Де | Формат | Суржик | [Стосується:] | Час | $/5K чанків |
|--------|--------|-----|:---:|:---:|:---:|:---:|:---:|
| Gemma 3 27B | 17GB | vast.ai A100 | **3/3** | Частково | Конкретно | 5с | ~$0.70 |
| **MamayLM bf16** | 23GB | vast.ai A100 | **3/3** | **✅** | Добре | 5с | ~$0.70 |
| MamayLM Q8 | 12GB | vast.ai A100 | **3/3** | ❌ | Добре | 4с | ~$0.50 |
| Lapa bf16 | 23GB | vast.ai A100 | 3/3 | ❌ | Середнє | 9с | ~$1.30 |
| Lapa Q4 | 6.8GB | Локально 4070Ti | 3/5 | ❌ | Загальне | 6-12с | Безкоштовно |
| MamayLM Q4 | 6.8GB | Локально 4070Ti | 2/5 | ✅ (коли ок) | Конкретно (коли ок) | 12-24с | Безкоштовно |
| Qwen3 32B | 19GB | vast.ai A100 | **0/3** ❌ | - | - | 8-18с | - |

## Висновки

1. **Claude Haiku 4.5** — найкраща якість, baseline для порівняння, але найдорожчий
2. **Gemini 3.1 Flash-Lite** — **best value**: 90% якості Haiku, 4x дешевше, швидкий (2с)
3. **GPT-5.4 Nano** — дешевий ($1.80/5K), розуміє аудиторію АТБ, стабільний формат
4. **Gemini 3 Flash** — на рівні Haiku, розуміє ролі (HR, кадри), 2x дешевше
5. **Qwen3 235B Jul** — найдешевший ($0.73/5K) з топ-якістю, але нестабільна швидкість
6. **Grok 4.1 Fast** — дешевий ($1.50/5K), формат стабільний, але повільний (8с)
7. MiniMax, Mistral Small 3.1 — не підходять (формат/швидкість)
8. Llama 4 Scout — не тримає формат `[]`

## Рекомендація

- **Поштучний імпорт** (UI): Claude Haiku 4.5 — найкраща якість
- **Масовий реіндекс** (бюджет): Gemini 3.1 Flash-Lite ($3.38/5K) або GPT-5.4 Nano ($1.80/5K)
- **Масовий реіндекс** (мінімум ціни): Qwen3 235B Jul ($0.73/5K, якщо терпимо до швидкості)
- **Self-hosted**: MamayLM bf16 на vast.ai A100 (~$0.70/5K)


# ===== FILE: reference-plans-planner-docs.md =====

---
name: Plans & Planner business logic docs
description: Полные описания бизнес-логики модулей Планирование и Планувальник — статусы, флоу, роли, edge cases
type: reference
---

Два документа с полным описанием бизнес-логики:

- **`docs/plans/PLANS-BUSINESS-LOGIC.md`** — модуль Планирование (Plans V2): 3 статуса (pending/active/done), иерархия процесс->процедура->месячный план, копирование, распределение часов по компаниям, роли
- **`docs/plans/PLANNER-BUSINESS-LOGIC.md`** — модуль Планувальник (Planner): типы записей (plan/external/ghost/обед), Outlook sync (Pull/Push/delta), entryStatus приоритеты, suggest стратегии, collect tasks, drafts, task templates, meetings с AI-саммари

## Plans V2 Service Architecture (as of 2026-04-01)

```
lib/ops/plans/
  plans.queries.ts     — PostgREST queries (client-side) + RPC get_plan_details
  plans.query-options.ts — TanStack Query options wrapping queries
  plans.mappers.ts     — pure computation (no DB, no side effects)
  plans.types.ts       — TypeScript types
  status.ts            — status transition matrix
  status-commands.ts   — status change commands (client-side via PostgREST)
  bot-adapter.ts       — bot integration
```

## DB RPC functions for Plans
- `get_plan_details(p_plan_ids uuid[])` — single call returns assignees, companies, projects, kb_docs, tasks as JSON
- `get_task_hours_by_plan_user(p_plan_ids uuid[])` — used by KPI + bot

**How to apply:** При работе с Plans или Planner — сначала проверить эти документы на актуальность бизнес-логики. При изменениях в модулях — обновлять документы.


# ===== FILE: reference-vastai.md =====

---
name: vast.ai GPU rental for model testing
description: Як використовувати vast.ai для запуску LLM моделей — CLI, SSH, Ollama setup
type: reference
---

# vast.ai — GPU rental

## Акаунт
- API key збережений в `~/.config/vastai/vast_api_key`
- CLI: `VASTAI=/c/Users/i_max/AppData/Roaming/Python/Python313/Scripts/vastai.exe`

## SSH ключ
- Публічний ключ `~/.ssh/id_nas.pub` додано до vast.ai акаунту (id 718299)
- Підключення: `ssh -i ~/.ssh/id_nas -p {PORT} root@{IP}`

## Типовий workflow

```bash
VASTAI=/c/Users/i_max/AppData/Roaming/Python/Python313/Scripts/vastai.exe

# 1. Знайти машину (A100 40GB, ~$0.50/год)
$VASTAI search offers 'gpu_ram>=40 num_gpus=1 reliability>0.95' -o 'dph' --limit 5

# 2. Створити інстанс з Ollama
$VASTAI create instance {OFFER_ID} --image ollama/ollama --disk 60 --ssh --direct

# 3. Отримати SSH URL
$VASTAI ssh-url {INSTANCE_ID}

# 4. Підключити SSH ключ (якщо новий інстанс)
$VASTAI attach ssh {INSTANCE_ID} "$(cat ~/.ssh/id_nas.pub)"

# 5. SSH і запустити Ollama + модель
ssh -i ~/.ssh/id_nas -p {PORT} root@{IP}
> nohup ollama serve > /tmp/ollama.log 2>&1 &
> ollama pull gemma3:27b

# 6. SSH tunnel для API доступу з локальної машини
ssh -i ~/.ssh/id_nas -p {PORT} -L 11435:localhost:11434 root@{IP} -N

# 7. Зупинити і видалити (зупинити білінг!)
$VASTAI destroy instance {INSTANCE_ID}
```

## Конвертація safetensors → GGUF на vast.ai

```bash
apt-get install -y python3-pip cmake build-essential git
pip3 install --break-system-packages huggingface_hub gguf torch sentencepiece protobuf transformers
git clone --depth 1 https://github.com/ggml-org/llama.cpp /tmp/llama.cpp

python3 -c "
from huggingface_hub import snapshot_download
snapshot_download('INSAIT-Institute/MamayLM-Gemma-3-12B-IT-v1.0', local_dir='/tmp/model')
"

python3 /tmp/llama.cpp/convert_hf_to_gguf.py /tmp/model --outtype bf16 --outfile /tmp/model-bf16.gguf
```

## Ціни (орієнтовні, 2026-03)
- A100 40GB: ~$0.50/год
- A6000 48GB: ~$0.37/год
- RTX 4090: ~$0.50/год
- Трафік: ~$0.003/GB


# ===== FILE: MEMORY.md =====

# Project Memory - CS Platform

> For architecture, boundaries, data flows → read **docs/ARCHITECTURE.md**
> For decisions → read **docs/DECISIONS.md**
> For Plans business logic → read **docs/plans/PLANS-BUSINESS-LOGIC.md**
> For Planner business logic → read **docs/plans/PLANNER-BUSINESS-LOGIC.md**

## User Preferences
- Communicates in Russian, prefers concise responses
- Vibe-programmer (knows C++/C#/SQL, NOT this stack). Plans: SIMPLE & SHORT — what/why/result. NO tech details.
- Prefers to do things right the first time
- **Database:** Self-hosted PostgreSQL 16 on DB VPS (see **memory/infra-db-vps.md**)
- SQL queries: использовать **postgres MCP** (`mcp__postgres__query`). Для write — попросить full control
- [MCP postgres write access](feedback-mcp-postgres-write.md) — просить full control, не SSH
- NEVER read .sql migration files — check actual DB via postgres MCP или SSH psql
- **DEPLOY:** СТРОГО ТОЛЬКО после явного разрешения. "Деплой" = дев, "деплой на прод" = прод.
- **Dev server:** `npm run dev:https` — запускать ТОЛЬКО по просьбе пользователя
- **Playwright URL:** `https://maxtitan.me:8080/` (дев)
- **Прод URL:** `https://maxtitan.me` (без порта)
- **Preview tools:** НЕ использовать для основного сайта. Для standalone HTML (demo-*.html) — ok.
- **feature-dev plugin:** Use silently without asking.

## Инфраструктура — 2 VPS Hetzner

### App VPS — Прод (91.99.156.163)
→ See **memory/infra-app-vps.md** for full details
- **URL:** `https://maxtitan.me` (порт 443)
- **SSH:** `ssh -i ~/.ssh/id_nas root@91.99.156.163`
- **Work dir:** `/opt/cs-platform/`, pm2 `cs-platform`
- **Deploy:** `bash deploy.sh` (собирает + заливает + рестартит)
- **Также проксирует** `:8080` → DB VPS `:3001` (дев-сервер)
- **PostgREST:** через внутреннюю сеть `10.0.0.3:3000`

### DB VPS — БД + Дев (46.225.234.164)
→ See **memory/infra-db-vps.md** for DB details
→ See **memory/infra-dev-vps.md** for Dev server details
→ See **memory/infra-deploy-flow.md** for deploy/sync procedures
- **SSH:** `ssh -i ~/.ssh/id_nas root@46.225.234.164`
- **PostgreSQL 16 + pgvector + PostgREST 12** (порт 3000)
- **Дев-сервер:** `/opt/cs-dev/`, pm2 `cs-dev`, `next dev` (hot reload, БЕЗ билда!)
- **Синк на дев:** rsync/tar исходников → hot reload подхватит. НЕ билдить!

### Схема сети
```
Браузер → maxtitan.me:443 → App VPS (прод, Next.js PORT=443)
Браузер → maxtitan.me:8080 → App VPS → проксирует → DB VPS :3001 (дев, Next.js)
App VPS → 10.0.0.3:3000 → DB VPS (PostgREST → PostgreSQL)
Дев    → localhost:3000 → PostgREST → PostgreSQL (всё на одном VPS)
LAN → MikroTik WG → App VPS (10.77.1.1) → MASQUERADE → DB VPS (10.0.0.3)
MCP postgres → 10.0.0.3:5432 (через WG+MASQUERADE)
```

## Design Preferences
→ See **memory/design-preferences.md** for full details
- Glassmorphism, slate palette, icon buttons WITHOUT background
- Confirm mode in header (not dialog), danger = inverted colors

## UI 2.0 — Mandatory Design Reference
- **Эталон:** `demo-design3.html` — единственный источник правды для UI
- Если элемент есть → использовать ТОЧНО. Если нет → СПРОСИТЬ пользователя.
- **Каталог:** `.claude/rules/ui-design.md` §13-16
- **CSS Bridge:** className для вида, Tailwind для layout, inline ТОЛЬКО для динамических значений

## Business Logic Gotchas
- `user_profiles.work_rate` — numeric 0..1, snapshot to `employee_timesheet.work_rate`
- Companies on `daily_task` level: `daily_task_companies`, `distribution_type`
- View: `v_plan_user_company_hours` — task-level distributed hours
- KPI thresholds: ≥130% amber, ≥100% green, ≥70% orange, <70% red
- Reference data is static — staleTime: Infinity
- Presence: in-memory Map, heartbeat 90s, TTL 4min. Lost on restart — ok.
- Teams does NOT support `data: URI` for files
- MikroTik LAN: static DNS `maxtitan.me → 192.168.88.154`
- [Сетевой туннель](infra-network-tunnel.md) — GRE/WG на MikroTik, вся LAN → 10.77.x.x без локального VPN

## Role System
- **5 roles:** `chief` > `head` > `analyst` > `employee` > `kb_user`
- **Role groups:** `src/lib/shared/auth/role-groups.ts`
- **kb_user:** Teams bot only, blocked from web UI

## Company & Domain
- [Company & KB context](project-company-context.md) — нац. ретейл Украины, БЗ = юр. документы для ретейла

## RAG Search Architecture
- [RAG Search Architecture](rag-search-architecture.md) — повний pipeline, методи, інструменти
- [KB Eval Baseline 2026-03-30](project-kb-eval-baseline-2026-03-30.md) — metrics after L1/L2 pipeline overhaul
- [KB Reranker Tuning](project-kb-reranker-plan.md) — scope soft boost, candidate recall, keyword rescue
- [KB Legal Locator](project-kb-legal-locator.md) — детерміністичний пошук по номеру статті/пункту закону

## Pending Tasks
- [Reindex KB after RAG enhancement](project-reindex-pending.md) — enriched embeddings потребують reindex
- **MSAL Auth:** `blank.html` redirect URIs не зареєстровані в Azure AD (деталі в tech-debt.md)

## KB User Feedback
- [Denisov feedback 2026-03-30](project-kb-denisov-feedback.md) — нет судебной практики, слабый поиск по ответственности

## Technical Debt
→ See **memory/tech-debt.md** for full list

## Quarterly Projects (APPROVED, not implemented)
→ See **memory/project-quarterly-projects.md**

## Planner Ideas
- [Drag шаблона в календарь](project-template-drag-idea.md)
- [Редизайн панели задач](project-planner-tasks-redesign.md)

## Strategy & Gaps
- [Strategy vs Implementation gaps](project-strategy-gaps-2026-04-02.md) — что есть/нет, архитектурные решения, 4 Mermaid-схемы
- **Consolidated strategy doc:** `docs/STRATEGY_PLANS_KPI.md` (from SOC_KPI_IDEAS + target model + roadmap)

## Plans V2 Architecture
- [Plans architecture](design-plans-architecture.md) — планы первичная сущность, процессы — справочник, навигация статика/динамика

- [План → Процесс — ключевая связь](design-plan-process-hierarchy.md) — процесс = основа всех планов, процедуры/инициативы → процесс → KPI

## Plans V2 Design Decisions
- [Статуси та іконки планів](design-plan-status-icons.md) — pending/active/done, Play/Pause icons
- [Матриця панелей](../docs/plans/plans-v2-matrix.md) — як будуються 3 панелі по scope
- [Plans & Planner docs](reference-plans-planner-docs.md) — бизнес-логика + service architecture
- [Editing rules](design-plans-v2-editing.md) — що редагується, матриця фільтр×сайдбар, pending-only
- [Status flow & roles](design-plan-status-flow.md) — переходи статусів, хто може що, action bar

## Feedback
- [feedback-minimal-employee-input.md](feedback-minimal-employee-input.md) — Классификация задач auto-inherited, сотрудник вводит только часы
- [feedback-mermaid-diagrams.md](feedback-mermaid-diagrams.md) — Все схемы в Mermaid, тёмная тема, VS Code preview
- [feedback-no-dev-build.md](feedback-no-dev-build.md) — НИКОГДА не запускать npm run dev
- [feedback-no-deploy.md](feedback-no-deploy.md) — НИКОГДА не деплоить без разрешения
- [feedback-no-decisions.md](feedback-no-decisions.md) — Всегда спрашивать, не решать за пользователя
- [feedback-css-bridge.md](feedback-css-bridge.md) — CSS-классы из globals.css, не inline style
- [feedback-design-check.md](feedback-design-check.md) — Проверять demo-design3.html перед UI кодом
- [feedback-design-rewrite.md](feedback-design-rewrite.md) — ТОЧНЫЕ значения из эталона, не по памяти
- [feedback-approve-before-sync.md](feedback-approve-before-sync.md) — НИКОГДА не синкать/деплоить без разрешения, сначала обсуждение → апрув → синк
- [feedback-action-over-analysis.md](feedback-action-over-analysis.md) — Задача понятна → ДЕЛАЙ
- [feedback-deploy-target.md](feedback-deploy-target.md) — "Деплой" без уточнения = дев
- [feedback-db-logic-first.md](feedback-db-logic-first.md) — Логика данных в PostgreSQL (вью, RPC, constraints), не в JS. API = тонкая обёртка.
- [feedback-postgrest-client.md](feedback-postgrest-client.md) — PostgREST паттерн из supabase/postgrest-js
- [feedback-plans-are-primary.md](feedback-plans-are-primary.md) — Планы — первичная сущность, процессы/процедуры — справочник

## External References
- [MCP servers](reference-mcp-servers.md) — postgres, Context7, Microsoft Learn, Playwright, Telegram
- [Model benchmarks](reference-model-benchmarks.md) — тести Haiku/Gemma/MamayLM/Lapa для prefix generation
- [vast.ai GPU rental](reference-vastai.md) — CLI, SSH, Ollama, конвертація моделей

## Historical (reference only)
- [Planner Audit 2026-03-19](project-planner-audit-2026-03-19.md) — complete, cabinet→planner extraction
