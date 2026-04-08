# Модуль Voice Bot — Технічне завдання

> Версія: 1.0 | Дата: 2026-03-04
> Статус: Проєктування

---

## 1. Призначення

Модуль **Voice Bot** — голосовий інтерфейс до CS Platform. Дозволяє співробітникам взаємодіяти з платформою голосом у реальному часі: запитувати інформацію з бази знань, отримувати дані по планах, звітах, KPI — через живу розмову замість тексту.

### Що входить

- Realtime голосовий чат (не голосові повідомлення — живий діалог)
- Канали доступу: Telegram Mini App, Teams Tab, веб-сторінка
- Інтеграція з KB RAG (база знань платформи)
- Інтеграція з існуючими інструментами бота (плани, звіти, KPI, активність)
- Дашборд для моніторингу (статистика, логи розмов)
- Підтримка українською та російською мовами
- Клонування голосу (кастомний голос бота)

### Що НЕ входить

- SIP / телефонія / приймання вхідних дзвінків
- Публічний доступ без авторизації
- Офлайн-режим
- Голосові повідомлення (ping-pong)

---

## 2. Аналіз ринку Voice AI API

Дослідження проведено у березні 2026. Порівняно 10+ провайдерів у 4 категоріях.

### A. Все-в-одному (Speech-to-Speech)

| Провайдер | Вартість | Голоси | Клонування | Укр. мова | Latency |
|---|---|---|---|---|---|
| **OpenAI Realtime API** | вхід $0.06 + вихід $0.24/хв | ~9 голосів | ❌ Ні | Середньо | ~500ms |

**Переваги:** єдиний провайдер, єдиний рахунок, мінімальна інтеграція.
**Недоліки:** немає клонування голосу, обмежений вибір голосів, укр. мова не нативна, висока вартість виходу.

### B. Платформи-оркестратори

| Провайдер | Базова вартість | Підсумок/хв | STT | TTS | LLM | Телефонія |
|---|---|---|---|---|---|---|
| **Vapi.ai** | $0.05/хв | ~$0.10-0.15 | на вибір | на вибір | на вибір | ✅ SIP |
| **Retell.ai** | $0.07-0.14/хв | включено | безкоштовно | включено | включено | ✅ SIP |
| **Bland.ai** | $0.09/хв | включено | включено | включено | включено | ✅ SIP |

**Переваги:** гнучкий вибір провайдерів (Vapi), простий запуск, вбудована телефонія.
**Недоліки:** залежність від платформи, Vapi — неочевидна фінальна ціна (базова + STT + TTS + LLM), дані на їх серверах.

### C. Компонентний підхід (Self-Hosted)

| Провайдер | Вартість | Опис |
|---|---|---|
| **LiveKit Agents** | безкоштовно (self-hosted) / від $0.0005/хв (Cloud) | Open-source WebRTC + AI agents framework |

**Переваги:** повний контроль, дані на своїх серверах, дешевше при великих обсягах, відкритий код.
**Недоліки:** потрібна інфраструктура (GPU для STT/TTS), складніше розгортання, підтримка самостійно.

### D. TTS-провайдери з Conversational AI

| Провайдер | Вартість/хв | Якість голосу | Клонування | Мов | Latency |
|---|---|---|---|---|---|
| **ElevenLabs** | $0.08-0.10 | Найкраща | ✅ Від 30с аудіо | 125+ | 75ms (Flash v2.5) |
| **Cartesia Sonic Turbo** | ~$0.03 (TTS) | Висока | ✅ (від Pro) | 50+ | 40ms TTFB |

**ElevenLabs:** найкраща якість голосу та клонування, широка підтримка мов (укр. + рус.), вбудований Conversational AI з WebSocket API, function calling для інтеграції з KB.
**Cartesia:** найшвидший TTS (40ms), але тільки TTS — потрібен окремий STT та оркестрація.

### Рекомендація

**ElevenLabs Conversational AI** — оптимальний вибір для модуля Voice Bot:

| Критерій | Оцінка |
|---|---|
| Якість укр./рус. голосу | ★★★★★ |
| Клонування голосу | ✅ Від 30 секунд аудіо |
| Latency | 75ms (Flash v2.5) |
| Function calling (KB інтеграція) | ✅ Вбудовано |
| Вартість | $0.08-0.10/хв (~$5/год при 1000 хв/міс) |
| WebSocket API | ✅ Streaming |
| Складність інтеграції | Низька |
| Вибір LLM | GPT, Claude, Gemini, open-source |

**Альтернатива для масштабування:** LiveKit (self-hosted) + Whisper + Claude + ElevenLabs TTS — повний контроль, нижча вартість при великих обсягах.

---

## 3. Архітектура

### Потік даних

```
Співробітник (браузер)
    │
    ▼
┌───────────────────────────────────┐
│  Веб-сторінка /voice-chat         │
│  (ElevenLabs Web SDK / WebSocket) │
└───────────┬───────────────────────┘
            │ WebSocket (audio stream)
            ▼
┌───────────────────────────────────┐
│  ElevenLabs Conversational AI     │
│  ┌─────────┐  ┌─────┐  ┌─────┐   │
│  │  STT    │→ │ LLM │→ │ TTS │   │
│  │(Whisper)│  │(GPT/│  │(EL  │   │
│  │         │  │Claude│  │Flash│   │
│  └─────────┘  └──┬──┘  └─────┘   │
│                  │ function call   │
└──────────────────┼────────────────┘
                   │
                   ▼
┌───────────────────────────────────┐
│  CS Platform API                  │
│  /api/voice/kb-search  → KB RAG   │
│  /api/voice/tools      → Bot Tools│
└───────────────────────────────────┘
```

### Канали доступу

```
Telegram Bot              Teams Bot                  Браузер
    │                         │                         │
    ▼                         ▼                         ▼
кнопка «🎤 Голос»      карточка «🎤 Голос»       меню «Голосовий бот»
    │                         │                         │
    ▼                         ▼                         ▼
Telegram Mini App         Teams Task Module         /voice-chat
    │                         │                         │
    └─────────────────────────┼─────────────────────────┘
                              │
                              ▼
                    /voice-chat (єдина сторінка)
                    ElevenLabs Web SDK
```

### Файлова структура

```
src/
├── lib/bot/voice/                      # Ядро модуля
│   ├── elevenlabs-client.ts            # ElevenLabs API: агенти, голоси, конфіг
│   ├── voice-config.ts                 # Налаштування: промпт, голос, tools
│   └── webhook-handler.ts             # Обробка webhook-подій від ElevenLabs
│
├── app/
│   ├── api/voice/
│   │   ├── webhook/route.ts            # POST — події від ElevenLabs (public)
│   │   ├── kb-search/route.ts          # POST — function call → KB RAG (public)
│   │   ├── tools/route.ts              # POST — function call → Bot Tools (public)
│   │   └── config/route.ts             # GET/PUT — налаштування (auth, chief/head)
│   │
│   └── voice-chat/
│       └── page.tsx                    # Веб-сторінка голосового чату (auth required)
│
└── components/dashboard/voice/
    └── VoiceBotContent.tsx             # Дашборд: статистика, логи, налаштування
```

### Обмеження розміру файлів

| Тип | Максимум |
|---|---|
| lib/bot/voice/*.ts | 300 рядків |
| app/api/voice/*/route.ts | 300 рядків |
| components/dashboard/voice/*.tsx | 400 рядків |

### Залежності (module boundaries)

```
ДОЗВОЛЕНО:
  app/voice-chat/page.tsx → components/dashboard/voice/
  app/api/voice/ → lib/bot/voice/, lib/shared/auth/, lib/kb/bot-adapter.ts
  lib/bot/voice/ → lib/shared/, lib/kb/bot-adapter.ts (через API)
  components/dashboard/voice/ → hooks/

ЗАБОРОНЕНО:
  lib/bot/voice/ → lib/ops/ напряму (тільки через bot-adapter)
  components/dashboard/voice/ → lib/bot/voice/ напряму (тільки через hooks)
```

---

## 4. Компоненти

### 4.1. Веб-сторінка голосового чату (`/voice-chat`)

**Призначення:** єдина точка входу для голосового діалогу.

**UI-елементи:**
- Кнопка «Почати розмову» / «Завершити розмову»
- Індикатор стану: очікування / слухає / думає / говорить
- Візуалізація аудіо (waveform або пульсація)
- Транскрипт розмови (текстом, real-time)
- Вибір мови (укр/рус) — опціонально, auto-detect за замовчуванням

**Авторизація:** JWT cookie (стандартна CS Platform auth). Сторінка недоступна без авторизації.

**Технологія:** ElevenLabs Conversational AI Web SDK (WebSocket).

### 4.2. API Routes

#### `POST /api/voice/kb-search`
- **Призначення:** ElevenLabs function call → пошук у базі знань
- **Авторизація:** webhook secret (не JWT — виклик від ElevenLabs)
- **Вхід:** `{ query: string, language: "uk" | "ru" }`
- **Вихід:** `{ answer: string, sources: string[] }`
- **Логіка:** викликає існуючий `lib/kb/bot-adapter.ts` → `kbSearchTool`

#### `POST /api/voice/tools`
- **Призначення:** ElevenLabs function call → інструменти бота (плани, KPI, активність)
- **Авторизація:** webhook secret
- **Вхід:** `{ tool: string, args: object, userId: string }`
- **Вихід:** `{ result: string }`
- **Логіка:** маршрутизація до відповідного bot-adapter tool

#### `POST /api/voice/webhook`
- **Призначення:** приймає події від ElevenLabs (початок/кінець розмови, помилки)
- **Авторизація:** webhook secret
- **Логіка:** логування, статистика, обробка помилок

#### `GET/PUT /api/voice/config`
- **Призначення:** налаштування голосового бота
- **Авторизація:** JWT, тільки chief/head
- **Параметри:** промпт, голос, активність модуля

### 4.3. Інтеграція з Telegram

**Реалізація:** нова кнопка в `lib/bot/telegram/direct-router.ts`

```
Команда: /voice або кнопка «🎤 Голосовий чат»
Дія: відправляє InlineKeyboard з WebApp URL → /voice-chat
```

Обсяг змін: ~10-15 рядків.

### 4.4. Інтеграція з Teams

**Реалізація:** нова карточка в `lib/bot/teams/direct-router.ts`

```
Команда: кнопка «🎤 Голосовий чат»
Дія: відкриває Task Module з URL → /voice-chat
```

Обсяг змін: ~10-15 рядків.

### 4.5. Дашборд (`/dashboard` → секція Voice Bot)

**Призначення:** моніторинг та налаштування для chief/head.

**Вміст:**
- Кількість розмов (за день/тиждень/місяць)
- Середня тривалість розмови
- Популярні запити
- Логи розмов (транскрипти)
- Налаштування: промпт, голос, вкл/вимк

---

## 5. Сценарії використання

### Сценарій 1: Запит до бази знань голосом

```
1. Співробітник відкриває Telegram → натискає «🎤 Голосовий чат»
2. Відкривається Mini App з /voice-chat
3. Натискає «Почати розмову»
4. Каже: «Яка процедура перевірки мережевого обладнання?»
5. ElevenLabs → STT → розпізнає → визначає інтент (KB search)
6. Function call → /api/voice/kb-search → KB RAG → знаходить відповідь
7. LLM формує відповідь → TTS → бот озвучує відповідь
8. Співробітник чує відповідь, може задати уточнення
```

### Сценарій 2: Запит по KPI/планах

```
1. Співробітник: «Покажи мій KPI за лютий»
2. ElevenLabs визначає інтент → function call → /api/voice/tools
3. Tool: getKpiTool → отримує дані
4. Бот озвучує: «Ваш KPI за лютий: виконання 94%, оцінка зелена...»
```

### Сценарій 3: Мультимовний діалог

```
1. Співробітник говорить російською: «Какие планы на март?»
2. STT розпізнає російську
3. LLM відповідає російською (auto-detect)
4. Якщо переключається на українську — бот теж переключається
```

---

## 6. Безпека та обмеження

### Авторизація

| Компонент | Метод |
|---|---|
| /voice-chat (сторінка) | JWT cookie (стандартна auth CS Platform) |
| /api/voice/webhook | Webhook secret header |
| /api/voice/kb-search | Webhook secret header |
| /api/voice/tools | Webhook secret header + userId у тілі |
| /api/voice/config | JWT cookie, role: chief або head |

### Rate Limiting

| Endpoint | Ліміт |
|---|---|
| /api/voice/kb-search | 20 запитів/хв на userId |
| /api/voice/tools | 20 запитів/хв на userId |
| /api/voice/webhook | 100 запитів/хв global |
| Одночасні розмови | Макс 5 (ліміт ElevenLabs плану) |

### Дані та приватність

- **Аудіо НЕ зберігається** на серверах CS Platform
- Зберігаються тільки **текстові транскрипти** (для логів та аналітики)
- Транскрипти зберігаються 30 днів, потім автоочищення
- ElevenLabs обробляє аудіо на своїх серверах (US/EU) — врахувати при оцінці ризиків

### Feature Flag

- `VOICE_BOT_ENABLED=true/false` — глобальний вимикач модуля
- Якщо вимкнено: кнопки в Telegram/Teams не показуються, /voice-chat повертає 503

---

## 7. Конфігурація

### Змінні середовища

```env
# Voice Bot (ElevenLabs)
VOICE_BOT_ENABLED=true
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_AGENT_ID=agent_...
ELEVENLABS_WEBHOOK_SECRET=whsec_...
```

### Налаштування ElevenLabs Agent

Конфігурується через ElevenLabs Dashboard або API:

- **Голос:** обирається з бібліотеки або клонований
- **LLM:** Claude Sonnet або GPT-4o
- **Системний промпт:** опис ролі, доступних інструментів, мовна поведінка
- **Tools (function calling):**
  - `search_knowledge_base` → `/api/voice/kb-search`
  - `get_bot_tool` → `/api/voice/tools`
- **First message:** «Вітаю! Я голосовий помічник CS Platform. Чим можу допомогти?»

---

## 8. Мовна підтримка

| Функція | Українська | Російська |
|---|---|---|
| Розпізнавання мовлення (STT) | ✅ | ✅ |
| Синтез мовлення (TTS) | ✅ | ✅ |
| Auto-detect мови | ✅ | ✅ |
| Суржик / мікс | Часткова підтримка | Часткова підтримка |

**Поведінка:** бот визначає мову співробітника автоматично та відповідає тією ж мовою. Якщо мова змінюється в процесі розмови — бот адаптується.

---

## 9. Розгортання

### Інфраструктура

Модуль є частиною CS Platform — окремого деплою не потрібно.

| Компонент | Де |
|---|---|
| Бекенд (API routes) | CS Platform (pm2: cs-platform) на Synology DS920+ |
| Фронтенд (/voice-chat) | Та ж Next.js app |
| Voice AI | ElevenLabs Cloud |
| База знань | PostgreSQL/PostgREST (pgvector) |

### Кроки розгортання

1. Додати env-змінні в `.env.production`
2. Оновити middleware: додати `/api/voice/webhook`, `/api/voice/kb-search`, `/api/voice/tools` до publicPaths
3. Створити ElevenLabs Agent через Dashboard або API
4. Налаштувати tools (webhook URLs)
5. `bash deploy.sh`

### Моніторинг

- Логи: `pm2 logs cs-platform` (стандартний logger)
- Статистика: дашборд у CS Platform
- ElevenLabs Dashboard: окрема аналітика дзвінків

---

## 10. Вартість

### Оцінка при типовому навантаженні

**Сценарій:** 20 співробітників, ~5 розмов/день, середня тривалість 2 хв.

| Параметр | Значення |
|---|---|
| Розмов/день | ~100 |
| Хвилин/день | ~200 |
| Хвилин/місяць | ~4,000 |
| **Вартість/місяць (ElevenLabs)** | **~$320-400** |

### Порівняння з альтернативами

| Провайдер | 4,000 хв/міс | Клонування | Укр. мова |
|---|---|---|---|
| **ElevenLabs** | ~$320-400 | ✅ | ✅ |
| OpenAI Realtime | ~$1,200+ | ❌ | Середньо |
| Vapi.ai | ~$400-600 | ✅ (через EL) | ✅ |
| Retell.ai | ~$280-560 | ❌ | Середньо |
| LiveKit (self-hosted) | ~$50-100 (інфра) + STT/TTS | ✅ | ✅ |

---

## 11. Етапи реалізації

### Етап 1: MVP (1-2 тижні)
- [ ] Створити ElevenLabs Agent (промпт, голос, tools)
- [ ] Реалізувати `/voice-chat` сторінку з ElevenLabs Web SDK
- [ ] Реалізувати `/api/voice/kb-search` (KB RAG інтеграція)
- [ ] Додати кнопку в Telegram/Teams боти
- [ ] Тестування з KB запитами

### Етап 2: Розширення (1 тиждень)
- [ ] Додати `/api/voice/tools` (плани, KPI, активність)
- [ ] Дашборд секція (VoiceBotContent.tsx)
- [ ] Логування розмов (транскрипти)
- [ ] Rate limiting

### Етап 3: Поліровка (1 тиждень)
- [ ] Клонування голосу (записати або обрати)
- [ ] Налаштування через дашборд (/api/voice/config)
- [ ] Аналітика (популярні запити, тривалість)
- [ ] Feature flag (VOICE_BOT_ENABLED)

---

## 12. Ризики

| Ризик | Ймовірність | Вплив | Мітигація |
|---|---|---|---|
| Погана якість укр. STT | Середня | Високий | Тестувати на реальних запитах, fallback на текст |
| Висока latency (>2с) | Низька | Високий | ElevenLabs Flash v2.5 (75ms), streaming |
| Перевищення бюджету | Середня | Середній | Feature flag, ліміти розмов/день |
| ElevenLabs downtime | Низька | Високий | Graceful degradation: повідомлення «сервіс недоступний» |
| Дані на серверах EL | — | Оцінити | Не передавати чутливі дані через голос, тільки KB |

---

## Джерела дослідження

- [ElevenLabs Conversational AI Pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs vs OpenAI Realtime API](https://elevenlabs.io/blog/comparing-elevenlabs-conversational-ai-v-openai-realtime-api)
- [Voice Agent Platforms Compared (Softcery)](https://softcery.com/lab/choosing-the-right-voice-agent-platform-in-2025)
- [Bland AI vs Vapi vs Retell](https://www.whitespacesolutions.ai/content/bland-ai-vs-vapi-vs-retell-comparison)
- [LiveKit Agents Framework](https://github.com/livekit/agents)
- [10 Real-Time AI Voice APIs (Medium)](https://medium.com/@codeinlife/10-real-time-ai-voice-apis-developers-should-know-in-2026-9ae4b5aef2f5)
- [Best TTS APIs 2026 Benchmarks (Inworld)](https://inworld.ai/resources/best-voice-ai-tts-apis-for-real-time-voice-agents-2026-benchmarks)
- [Cartesia Sonic Turbo](https://cartesia.ai/product/python-text-to-speech-api-tts)
- [OpenAI Realtime API Pricing](https://developers.openai.com/api/docs/pricing/)
