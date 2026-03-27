# CS Platform Bot — Архитектура и каналы

## Обзор

Бот системы CS Platform имеет **единое ядро** (`bot/core/`) и **каналы** как тонкие адаптеры.

```
┌─────────────────────────────────────────────────┐
│                 bot/core/                       │  ← МОЗГ: реестр, AI-цикл,
│   registry · permissions · router               │     права, промпт
│   system-prompt · types · tool-registry         │
└──────────────┬──────────────────┬───────────────┘
               │                  │
       ┌───────▼──────┐  ┌────────▼──────┐
       │ bot/telegram/ │  │  bot/teams/  │   ← КАНАЛЫ: только auth +
       │  (ReportBot)  │  │  (Jarvise)   │     отправка/получение
       └──────────────┘  └───────────────┘
```

**Инструменты реализованы в доменах** (`bot-adapter.ts`), ядро только регистрирует их.

---

## Ядро (bot/core/)

### Инструменты (bot-adapter pattern)

Инструменты реализованы в доменных модулях как `bot-adapter.ts`, а не в ядре.

| Tool | Описание | Scopes | Домен / Файл |
|------|----------|--------|-------------|
| `kb_search` | Поиск по базе знаний | all | `lib/kb/bot-adapter.ts` |
| `get_kpi` | KPI за период | own/dept/all | `lib/ops/kpi/bot-adapter.ts` |
| `get_activity` | Статистика активности | own/dept/all | `lib/ops/activity/bot-adapter.ts` |
| `get_hours` | Часы за месяц | own/dept/all | `lib/ops/plans/bot-adapter.ts` |
| `get_plans` | Сводка планов | own/dept/all | `lib/ops/plans/bot-adapter.ts` |
| `get_employee_report` | Текстовый отчёт по сотруднику | own/dept/all | `lib/ops/reports/bot-adapter.ts` |
| `generate_report` | DOCX/PDF отчёт по компании | dept/all | `lib/ops/reports/bot-adapter.ts` |
| `generate_quarterly` | Квартальный план/отчёт | dept/all | `lib/ops/reports/bot-adapter.ts` |

### Реестр (registry.ts)

Единственный экземпляр `botRegistry` содержит все 8 инструментов. Оба канала используют один реестр:

```typescript
import { botRegistry } from '@/lib/bot/core/registry';
const tools = botRegistry.getAll();
```

### Права (permissions.ts)

Загружает таблицу `bot_permissions` (кэш 5 мин):

```typescript
import { loadPermissions, getEnabledToolsForRole, invalidatePermissionsCache } from '@/lib/bot/core/permissions';

const permissions = await loadPermissions(db);
const enabledTools = getEnabledToolsForRole(permissions, role, allTools);
```

**Scope enforcement** — в коде инструмента (`execute()`), НЕ в AI-промпте.

### AI-роутер (router.ts)

Общий цикл AI + conversation memory для всех каналов:

```typescript
const result = await runBotRouter({
  userId, role, departmentId, fullName,
  message, conversationId,
  db, tools, toolScopes,  // toolScopes: Map<toolName, scope>
  botIdentity: 'Назва бота',
  apiKey, provider, model,
});
```

- **max 5 раундов** tool calling
- **Conversation memory**: последние Q+A хранятся в памяти 10 мин (per `conversationId`)
- **FormattedResult / DocumentResult**: если инструмент вернул — роутер отдаёт сразу, минуя AI

### Системный промпт (system-prompt.ts)

Единый промпт для всех каналов, параметризованный `botIdentity`:

```typescript
buildBotSystemPrompt({ fullName, role, tools, botIdentity });
```

**Тон:** разговорный, как коллега — 1-2 предложения, конкретные действия. Без казённого стиля.

### Интерфейс BotTool

```typescript
interface BotTool {
  name: string;           // slug = tool_name в DB
  label: string;          // для Admin UI
  description: string;    // для AI function calling
  supportedScopes: ToolScope[];
  parameters: Record<string, unknown>;  // JSON Schema
  execute(args, ctx: ToolContext): Promise<unknown>;
}

interface ToolContext {
  db: SupabaseClient;
  userId: string;
  role: UserRole;         // 'employee' | 'head' | 'chief'
  departmentId: string | null;
  fullName: string;
  scope: ToolScope;       // 'own' | 'department' | 'all'
}
```

---

## Канал: Telegram (ReportBot)

### Обзор

- **Аудитория:** все сотрудники
- **API ключ:** персональный (OpenAI / Anthropic, AES-256-GCM)
- **Кнопки:** ReplyKeyboard — прямой роутер без AI/API ключа
- **Свободный запрос:** требует API ключ → AI tool-calling loop

### Цикл обработки сообщения

```
POST /api/telegram/webhook (8443 → NAT → 3000)
  ↓ verify secret + rate limit (100/min global, 10/min per chat)
  ↓ resolveUserBasic(chatId) → BasicUser
  ↓ idempotency check (last_update_id)
  ↓ /start | /help → WELCOME + ReplyKeyboard, return
  ↓ sendChatAction('typing')
  ↓ tryDirectCommand(text) → direct-router.ts
      → совпало → sendMessage/sendDocument, return
  ↓ resolveApiKey(basicUser) → нет ключа → "Потрібен API ключ"
  ↓ processMessage() → telegram/ai-router.ts
      loadPermissions → getEnabledToolsForRole
      runBotRouter({ ..., apiKey=личный, provider=личный })
  ↓ sendMessage(text) | sendDocument(file)
```

### Прямой роутер (direct-router.ts)

| Кнопка | Tool | Роли |
|--------|------|------|
| `📄 Мій звіт` | `get_employee_report` | все |
| `📈 KPI` | `get_kpi` (month) | все |
| `⏰ Години` | `get_hours` | все |
| `📋 Плани` | `get_plans` | все |
| `👥 Онлайн` | `get_online` | все |

Прямой роутер проверяет permissions через `loadPermissions` (кэш). Если инструмент не разрешён → `null` → AI роутер.

### Привязка пользователя

1. Web UI → профиль → "Telegram Bot" → "Отримати код" (8 симв., 10 мин, 5 попыток)
2. Отправить код боту → аккаунт привязан
3. Настроить API ключ (Provider + Key + опционально Model)

### Ролевая модель

| Роль | Данные | Admin UI |
|------|--------|----------|
| `employee` | только свои | — |
| `head` | своего отдела | — |
| `chief` | все + manage permissions | ✓ |

### Конфигурация

| Env var | Описание |
|---------|----------|
| `TELEGRAM_BOT_TOKEN` | Токен от @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Секрет webhook (hex 32) |
| `TELEGRAM_ENCRYPTION_KEY` | Ключ шифрования API keys (hex 32) |

### Webhook setup (MikroTik NAT)

```bash
# Env
TELEGRAM_BOT_TOKEN=<from @BotFather>
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)
TELEGRAM_ENCRYPTION_KEY=$(openssl rand -hex 32)

# MikroTik: 8443 → server:3000
/ip firewall nat add chain=dstnat dst-port=8443 protocol=tcp \
  action=dst-nat to-addresses=<server-ip> to-ports=3000

# Register webhook (purchased cert, no upload needed)
curl -F "url=https://maxtitan.me:8443/api/telegram/webhook" \
  -F "secret_token=<WEBHOOK_SECRET>" \
  -F "allowed_updates=[\"message\"]" \
  "https://api.telegram.org/bot<TOKEN>/setWebhook"
```

### API endpoints

| Method | Endpoint | Описание | Auth |
|--------|----------|----------|------|
| POST | `/api/telegram/webhook` | Webhook handler | TG secret |
| POST | `/api/telegram/verify-code` | Сгенерировать код | Cookie |
| GET | `/api/telegram/verify-code` | Статус привязки | Cookie |
| DELETE | `/api/telegram/verify-code` | Отвязать | Cookie |
| PUT | `/api/telegram/api-key` | Сохранить API ключ | Cookie |
| DELETE | `/api/telegram/api-key` | Удалить API ключ | Cookie |
| GET | `/api/telegram/permissions` | Список permissions | Cookie (chief) |
| PUT | `/api/telegram/permissions` | Обновить permission | Cookie (chief) |
| POST | `/api/telegram/notify/plan-created` | Push: новый план | Cookie |
| POST | `/api/telegram/notify/broadcast` | Push: changelog | Cookie |
| POST | `/api/digest/weekly` | Push: тижневий дайджест (cron) | CRON_SECRET |

---

## Канал: Teams (Jarvise)

### Обзор

- **Аудитория:** сотрудники через Microsoft Teams
- **API ключ:** серверный `OPENAI_API_KEY` (пользователи не хранят ключи)
- **Auth:** Azure AD OID → RPC `get_user_id_by_azure_oid` → user_profiles
- **Scope:** все инструменты получают `scope='all'` (сервисный ключ)
- **Bot Framework:** CloudAdapter (Multi-Tenant)

### Цикл обработки

```
POST /api/teams/webhook
  ↓ CloudAdapter.process() — верификация Bot Framework JWT
  ↓ activity.from.aadObjectId → resolveOrCreateUser(db, oid)
  ↓ /start | /help | "допомога" → WELCOME + SuggestedActions, return
  ↓ sendActivity({ type: 'typing' })
  ↓ tryDirectTeamsCommand(text) → direct-router.ts
      → совпало → sendHtml/sendDocument, return
  ↓ process.env.OPENAI_API_KEY → нет → ошибка
  ↓ processTeamsMessage() → teams/ai-router.ts
      botRegistry.getAll() (все tools, scope='all')
      runBotRouter({ ..., apiKey=серверный, provider='openai', model='gpt-4o-mini' })
  ↓ sendMessage/sendHtml/sendDocument
```

### Прямой роутер (direct-router.ts)

| Quick Reply | Tool | Роли |
|-------------|------|------|
| `Мій звіт` | `get_employee_report` | все |
| `KPI` | `get_kpi` (month) | все |
| `Години` | `get_hours` | все |
| `Плани` | `get_plans` | все |

> Teams не проверяет permissions — сервисный ключ, scope='all'.

### SuggestedActions (quick-reply кнопки)

Teams показывает до 3 кнопок (чипов). Текущий набор: **Мій звіт**, **KPI**, **Години**.

### Конфигурация

| Env var | Описание |
|---------|----------|
| `MICROSOFT_APP_ID` | App ID из Azure Bot registration |
| `MICROSOFT_APP_PASSWORD` | Client secret |
| `OPENAI_API_KEY` | Серверный ключ для всех пользователей |

### API endpoints

| Method | Endpoint | Описание | Auth |
|--------|----------|----------|------|
| POST | `/api/teams/webhook` | Webhook handler | Bot Framework JWT |

---

## Уведомления (Push)

### plan-created

При создании/копировании месячного плана → уведомление исполнителям.

```
MonthlyPlanDetails.tsx (handleSave/handleCopyPlan) — fire-and-forget
  ↓ POST /api/telegram/notify/plan-created { monthlyPlanId }
  ↓ monthly_plans → procedure name
  ↓ monthly_plan_assignees → user_ids
  ↓ telegram_users WHERE user_id IN (...) AND is_active = true
  ↓ sendMessage() × N   (Promise.allSettled)
```

Формат:
```
📋 Вас назначили виконавцем нового плану

📌 Процедура: Обслуговування серверів
📅 Місяць: Лютий 2026
⏱ Планових годин: 40 год.
```

### broadcast (changelog)

`POST /api/telegram/notify/broadcast` — рассылка «Что нового» всем активным подписчикам.

**Trigger:** кнопка 📨 в UI (Активность → «Що нового»).

### weekly-digest (cron)

`POST /api/digest/weekly` — персональный дайджест каждому пользователю раз в неделю.

**Trigger:** pm2 cron `0 9 * * 1` (каждый понедельник 09:00), скрипт `scripts/digest-cron.mjs`.

**Auth:** заголовок `x-cron-secret: $CRON_SECRET` (не требует Cookie, в `publicPaths` middleware).

**Контент по роли:**
- `employee` — KPI месяца + статус плана + задачи за 7 дней (до 3 примеров)
- `head` — всё выше + команда (план-статусы, кто ниже нормы, задачи команды)
- `chief` — всё выше + company-wide (планів на затвердження, задач компании)

**Ключевые файлы:**
- `src/lib/ops/digest/service.ts` — `buildDigestMessage(db, user, now)` → HTML string
- `src/app/api/digest/weekly/route.ts` — endpoint
- `scripts/digest-cron.mjs` — cron runner (читает `.env.local` сам, NODE_TLS_REJECT_UNAUTHORIZED=0)

**Формат:**
```
📊 Дайджест — тиждень 17–23 берез.

👤 Особисто
• KPI берез.: 🟢 87%
• План: ✅ Затверджено (40 год)
• Задач за тиждень: 3 (14.2 год)
  · 17.03 — аудит ТОВ «Альфа» (4 год)

👥 Відділ  [тільки head]
• Планів на затвердження: 2 ⏳
• Нижче норми: Іваненко (52%)
• Задач команди: 18 (71 год)

🏢 Компанія  [тільки chief]
• Планів на затвердження: 5 ⏳
• Задач за тиждень: 45 (178 год)

До кінця місяця: 9 роб. днів
```

**Настройка pm2 на NAS (один раз):**
```bash
pm2 start /volume1/docker/reportib/scripts/digest-cron.mjs \
  --name digest-cron --cron "0 9 * * 1" --no-autorestart
pm2 save
```

### Добавление нового уведомления

1. Создать `src/app/api/telegram/notify/{event}/route.ts`
2. auth + rate limit (паттерн `api-patterns`)
3. service-role DB client
4. `sendMessage()` из `@/lib/bot/telegram/bot`
5. Вызывать fire-and-forget из места события

---

## Как добавить инструмент

1. Создать `src/lib/<domain>/bot-adapter.ts` — реализовать `BotTool` (по паттерну `kpi/bot-adapter.ts`)
2. **Scope enforcement** в `execute()` — ОБЯЗАТЕЛЬНО
3. Инструменты НЕ делают прямых запросов в DB — только вызывают существующие сервисы
4. Вернуть `FormattedResult` (HTML) или `DocumentResult` или plain JSON
5. Зарегистрировать в `src/lib/bot/core/registry.ts`
6. Добавить permissions в `src/lib/bot/core/permissions.ts`
7. `INSERT INTO telegram_bot_permissions` для 3 ролей (с нужными scope)

```typescript
// Шаблон инструмента
const myTool: BotTool = {
  name: 'get_xxx',
  label: 'Назва для UI',
  description: 'Описание для AI (что делает инструмент)',
  supportedScopes: ['own', 'department', 'all'],
  parameters: { type: 'object', properties: {}, required: [] },
  async execute(args, ctx) {
    // Scope enforcement
    const userId = ctx.scope === 'own' ? ctx.userId : undefined;
    const deptId = ctx.scope === 'department' ? ctx.departmentId : undefined;

    // Вызов сервиса
    const data = await someService(ctx.db, { userId, deptId });

    return { __type: 'formatted', text: '<b>Результат</b>', parseMode: 'HTML' } as FormattedResult;
  },
};
```

## Как добавить канал

1. Создать `src/lib/bot/{channel}/auth.ts` — аутентификация пользователя → `userId, role, departmentId`
2. Создать `src/lib/bot/{channel}/direct-router.ts` — детерминированные команды через `botRegistry`
3. Создать `src/lib/bot/{channel}/ai-router.ts` — тонкий адаптер:
   ```typescript
   // Если permissions нужны (как в Telegram):
   const permissions = await loadPermissions(db);
   const enabledTools = getEnabledToolsForRole(permissions, role, botRegistry.getAll());

   // Если всё разрешено (как в Teams — серверный ключ):
   const tools = botRegistry.getAll();

   return runBotRouter({ userId, role, ..., tools, apiKey, provider, model });
   ```
4. Создать `src/lib/bot/{channel}/bot.ts` — отправка сообщений (sendMessage, sendDocument)
5. Создать `src/app/api/{channel}/webhook/route.ts`

---

## Безопасность

| Аспект | Решение |
|--------|---------|
| Telegram webhook | `X-Telegram-Bot-Api-Secret-Token` |
| Teams webhook | Bot Framework JWT (CloudAdapter) |
| Idempotency | `last_update_id` в telegram_users |
| Rate limit | 10/min per chat + 100/min global (Telegram) |
| Scope enforcement | в `execute()`, не в AI prompt |
| Brute-force кодов | 8 симв, 5 попыток, 3/min |
| API keys | AES-256-GCM, расшифровка только at runtime |
| Error masking | пользователь не видит internal errors |

---

## Файловая структура

```
src/lib/bot/core/               ← ЯДРО БОТА
  types.ts                      — BotTool, ToolContext, FormattedResult, DocumentResult, ...
  tool-registry.ts              — класс ToolRegistry (register/getAll/getByName)
  registry.ts                   — единственный botRegistry со всеми 8 инструментами
  permissions.ts                — loadPermissions, getEnabledToolsForRole, invalidatePermissionsCache
  router.ts                     — runBotRouter (AI loop + conversation memory)
  system-prompt.ts              — buildBotSystemPrompt (единый промпт для всех каналов)
  index.ts                      — barrel re-export

src/lib/bot/shared/             ← ОБЩИЕ ХЕЛПЕРЫ для bot-adapter.ts
  format-base.ts                — fmtHours, fmtPct, kpiIcon, monthName, miniBar, ...
  format-helpers.ts             — esc() HTML + re-export format-base
  fuzzy-match.ts                — нечёткий поиск сотрудников / компаний
  index.ts                      — barrel re-export

src/lib/bot/audio/              ← Голосовой транскрайбер (Telegram)
src/lib/bot/notifications/      ← Мультиканальный нотификатор
  send.ts                       — sendNotification / sendNotificationsToAll
  index.ts

                                ← ИНСТРУМЕНТЫ (bot-adapter в каждом домене):
src/lib/kb/bot-adapter.ts       — kbSearchTool (RAG search)
src/lib/ops/kpi/bot-adapter.ts  — getKpiTool
src/lib/ops/activity/bot-adapter.ts — getActivityTool
src/lib/ops/plans/bot-adapter.ts    — getPlansTool, getHoursTool
src/lib/ops/reports/bot-adapter.ts  — getEmployeeReportTool, generateReportTool, generateQuarterlyTool

src/lib/bot/telegram/           ← КАНАЛ: Telegram (ReportBot)
  auth.ts                       — resolveUserBasic, resolveApiKey, verifyCode, updateLastUpdateId
  crypto.ts                     — AES-256-GCM шифрование API ключей
  bot.ts                        — sendMessage, sendDocument, sendChatAction, inline menu
  direct-router.ts              — ReplyKeyboard кнопки без AI (авто из реестра)
  ai-router.ts                  — тонкий адаптер: permissions → runBotRouter
  index.ts

src/lib/bot/teams/              ← КАНАЛ: Teams (Jarvise)
  auth.ts                       — resolveOrCreateUser (Azure OID → user_profiles)
  bot.ts                        — sendMessage, sendHtml, sendDocument
  direct-router.ts              — SuggestedActions кнопки без AI (авто из реестра)
  ai-router.ts                  — тонкий адаптер: botRegistry → runBotRouter (серверный ключ)
  index.ts

src/app/api/telegram/
  webhook/route.ts              — Telegram webhook handler
  verify-code/route.ts          — привязка/отвязка аккаунта
  api-key/route.ts              — управление персональными API ключами
  permissions/route.ts          — Admin UI permissions (chief)
  notification-settings/route.ts — настройки уведомлений (chief)
  notify/
    plan-created/route.ts       — push: новый месячный план
    broadcast/route.ts          — push: changelog всем

src/app/api/digest/
  weekly/route.ts               — тижневий дайджест (CRON_SECRET, publicPaths)

scripts/
  digest-cron.mjs               — pm2 cron runner (понедельник 09:00)

src/app/api/teams/
  webhook/route.ts              — Teams webhook (Bot Framework CloudAdapter)
  link/route.ts                 — привязка/отвязка Teams аккаунта (Web UI)

src/app/api/bot/
  notification-channel/route.ts — выбор канала уведомлений (telegram/teams/both)

src/lib/ops/telegram-queries.ts              — Telegram SQL helpers
src/components/dashboard/header/BotSection.tsx — UI привязки + API ключ (Telegram + Teams)
src/components/dashboard/bot/BotSettingsContent.tsx — Admin UI permissions (chief)
```

---

## Troubleshooting

| Проблема | Решение |
|----------|---------|
| Telegram бот не отвечает | `curl -X POST .../webhook` → 403 = ОК (secret работает) |
| 403 на Telegram webhook | Неверный `TELEGRAM_WEBHOOK_SECRET` |
| "Потрібен API ключ" | Нет персонального ключа в профиле |
| "Акаунт не прив'язано" | Нужен код привязки из web UI |
| Данные не приходят | Проверить permissions в Admin UI (вкладка TG Bot) |
| Teams бот не отвечает | Проверить `MICROSOFT_APP_ID` + `MICROSOFT_APP_PASSWORD` |
| Teams: "Сервісний AI ключ не налаштований" | Нет `OPENAI_API_KEY` на сервере |
| Инструмент недоступен | Проверить `telegram_bot_permissions` в DB |
| Уведомления не приходят | `telegram_users.is_active = true` для пользователя |
| Неверный стиль ответа | Проверить `bot/core/system-prompt.ts` — tone rules |
