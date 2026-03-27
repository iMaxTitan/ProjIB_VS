---
name: api-patterns
description: "Паттерны API routes для проекта CS Platform. Авторизация, PostgREST service-role, rate limiting, валидация. Используй при создании/изменении API routes. ОБЯЗАТЕЛЬНО используй этот скилл когда задача связана с app/api/, endpoint, route.ts, серверной логикой, webhook, REST API — даже если пользователь не упоминает 'api-patterns' явно."
---

# API Patterns — проект CS Platform

## Архитектура

- **Next.js 15 App Router** — `src/app/api/{module}/route.ts`
- **Supabase** — ТОЛЬКО service-role на сервере
- **Auth** — Azure AD JWT в cookie + DB user_id в cookie

## Обязательный шаблон API route

```typescript
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/lib/shared/logger';
import { getServerDb } from '@/lib/shared/db-server';
import {
  isRequestAuthorized,
  getRequesterKey,
  getDbUserId,
  checkRateLimit,
} from '@/lib/shared/api/request-guards';

// ─── Rate limit config ───
const RATE_LIMIT = 30;          // запросов
const RATE_WINDOW_MS = 60_000;  // за 1 минуту

export async function GET(req: NextRequest) {
  // 1. Авторизация
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Rate limiting
  const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
    );
  }

  // 3. User ID из cookie
  const userId = getDbUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // 4. (Опционально) Валидация query/body userId vs cookie
  const queryUserId = new URL(req.url).searchParams.get('userId');
  if (queryUserId && queryUserId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const db = getServerDb();

    // 5. Запросы к БД через service-role
    const { data, error } = await db
      .from('table_name')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: unknown) {
    logger.error('[module/action] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

## Критические правила

### 1. Supabase клиент — ТОЛЬКО service-role

```typescript
// ✅ Правильно — shared singleton из lib/shared/
import { getServerDb } from '@/lib/shared/db-server';
const db = getServerDb();

// ❌ ЗАПРЕЩЕНО — клиентский supabase на сервере (нет сессии → RLS блокирует ВСЁ)
import { supabase } from '@/lib/supabase';

// ❌ ЗАПРЕЩЕНО — создавать createClient() напрямую в route.ts (утечка соединений!)
```

### 2. userId — ТОЛЬКО из httpOnly cookie

```typescript
// ✅ Правильно — DB user_id из cookie (UUID из user_profiles)
const userId = getDbUserId(req);

// ❌ ЗАПРЕЩЕНО — Azure AD oid, НЕ DB user_id!
const oid = getAzureOidFromToken(req);  // Это Azure AD oid, не UUID из БД!
const oid2 = getUserIdFromToken(req);    // @deprecated — alias для getAzureOidFromToken
```

### 3. Валидация userId из query/body

```typescript
// Если клиент передаёт userId в параметрах — ОБЯЗАТЕЛЬНО сверить с cookie
const cookieUserId = getDbUserId(req);
const bodyUserId = body.userId;

if (bodyUserId && bodyUserId !== cookieUserId) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Использовать ТОЛЬКО из cookie
const userId = cookieUserId;
```

### 4. Rate limiting — ВСЕГДА

```typescript
// Стандартные лимиты:
// GET endpoints:  30 req/min
// POST endpoints: 10 req/min (мутации)
// AI endpoints:   10 req/min (дорогие вызовы)

const rateLimit = checkRateLimit(getRequesterKey(req), RATE_LIMIT, RATE_WINDOW_MS);
if (!rateLimit.allowed) {
  return NextResponse.json(
    { error: 'Too Many Requests' },
    { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } }
  );
}
```

### 5. Логирование — ТОЛЬКО logger, НИКАКИХ console.*

```typescript
// ✅ Правильно — с контекстом модуля
logger.error('[plans/count] Error:', error);
logger.error('[reports/pivot] Error:', error);

// ❌ ЗАПРЕЩЕНО — любые console.* вызовы в API routes
console.log('...');    // НЕТ
console.error('...');  // НЕТ — используй logger.error()
console.warn('...');   // НЕТ — используй logger.warn()
```

### 6. Cookies при логине

```typescript
// В /api/auth/token (уже реализовано):
// 1. auth_token — Azure AD JWT (для проверки авторизации)
// 2. x-user-id — DB UUID из user_profiles (для запросов к БД)
// Оба httpOnly, secure, sameSite: 'lax'
```

## Существующие API routes — ключевые

> Полный список: `src/app/api/**/route.ts` (~50 endpoints)

| Route | Метод | Назначение |
|-------|-------|-----------|
| `/api/auth/token` | POST | Логин: Azure AD → JWT + cookies |
| `/api/auth/check` | GET | Проверка авторизации |
| `/api/kpi` | GET | KPI расчёт |
| `/api/plans/count` | GET | Количество планов |
| `/api/reports/pivot` | GET | Pivot таблица отчётов |
| `/api/reports/monthly` | GET | Месячный отчёт |
| `/api/reports/generate` | POST | Генерация PDF |
| `/api/presence/heartbeat` | POST | Heartbeat онлайн-статуса |
| `/api/kb/search` | POST | Поиск в базе знаний |
| `/api/kb/documents` | GET/POST | Документы KB |
| `/api/kb/validate` | POST | Валидация KB |
| `/api/meetings` | GET/POST | Совещания |
| `/api/telegram/webhook` | POST | Telegram webhook (public) |
| `/api/teams/webhook` | POST | Teams webhook (public) |
| `/api/digest/weekly` | POST | Еженедельный дайджест (CRON_SECRET) |
| `/api/ai/activity-analysis` | POST | AI анализ активности |
| `/api/ai/task-assistant` | POST | AI помощник задач |

## Чеклист для нового API route

- [ ] `isRequestAuthorized(req)` — первая строка
- [ ] `checkRateLimit()` — вторая проверка (GET: 30/min, POST: 10/min, AI: 10/min)
- [ ] `getDbUserId(req)` — для userId (НЕ headers, НЕ query, НЕ getAzureOidFromToken)
- [ ] `getServerDb()` — shared service-role singleton (НЕ createClient!)
- [ ] Валидация userId из body/query vs cookie (если есть)
- [ ] `logger.error('[module/action]')` — в catch (НЕ console.error/log/warn)
- [ ] Типы ответов: 401, 403, 429, 400, 500
- [ ] Никаких `console.*` — только `logger`
- [ ] POST/PATCH: `user_id: userId` в insert/update (данные должны иметь автора)
- [ ] POST: валидация body полей (тип + наличие)

## Антипаттерны

```typescript
// ❌ Импорт клиентского supabase
import { supabase } from '@/lib/supabase';

// ❌ Создание нового клиента — createClient() ЗАПРЕЩЁН в route.ts
import { createClient } from '@supabase/supabase-js';
const db = createClient(url, key);  // Утечка соединений! Используй getServerDb()

// ❌ Чтение userId из headers/query без cookie
const userId = req.headers.get('x-user-id');           // Можно подделать!
const userId = req.nextUrl.searchParams.get('userId');  // Можно подделать!
// → Используй ТОЛЬКО getDbUserId(req) — читает httpOnly cookie

// ❌ Отсутствие rate limiting
export async function POST(req: NextRequest) {
  // Сразу к логике без проверок...
}

// ❌ console.* вместо logger
console.error('Failed:', error);  // Используй logger.error('[module] ...', error)

// ❌ Возврат stack trace в ответе
return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });

// ❌ Мутация без user_id — данные без автора
await db.from('comments').insert({ text });  // Кто автор? Добавь user_id: userId
```
