# Руководство разработчика ReportIB

> Последнее обновление: 2026-02-12

## Модель работы приложения

- Основная точка входа: `/` (`src/app/page.tsx`).
- Разделы дашборда переключаются внутри одной страницы:
  - `/` — активность
  - `/plans` — планы
  - `/reports` — отчеты
  - `/kpi` — KPI
  - `/references` — справочники
- Совместимые маршруты в `src/app/dashboard/*` и верхнеуровневые страницы
  реализованы как редиректы на `/`.

## Технологический стек

- Next.js 15 (App Router), React, TypeScript, Tailwind CSS
- Supabase (PostgreSQL + представления (view) + RPC)
- Интеграция Microsoft 365 / Azure AD
- Playwright для E2E

## Критические правила

1. Идентификаторы пользователей
- В бизнес-логике использовать только Supabase `user_id`.
- Не использовать Azure AD id как доменный id.

2. Доступ к данным
- Для чтения предпочитать представления (view).
- Для записи использовать сервисный/модульный слой:
  `src/modules/plans/*`, `src/lib/services/*`.

3. Навигация дашборда
- Переключение разделов выполняется внутри единой оболочки приложения.
- Не создавать новые изолированные экраны вида `/dashboard/<section>`.

4. Устаревшая weekly-модель
- Weekly-модель БД удалена.
- Не использовать и не возвращать weekly-таблицы/представления/функции.

---

## Работа с базой данных — паттерны

### Архитектура доступа к данным

В проекте два контекста работы с Supabase:

| Контекст | Клиент | RLS | Где используется |
|----------|--------|-----|------------------|
| **Клиент (браузер)** | `supabase` из `@/lib/supabase` | Да, custom JWT (HS256) | Хуки, компоненты |
| **API routes (сервер)** | `getDb()` — service-role singleton | Обходит RLS | `/api/*` routes |

### 1. Клиент (хуки/компоненты) — TanStack Query

Все клиентские запросы идут через **TanStack Query** с кешированием.
Провайдер: `src/providers/QueryProvider.tsx`.

#### Справочники (staleTime: Infinity)

Справочники загружаются **один раз за сессию** и не перезапрашиваются при навигации.

**Файл:** `src/lib/queries/reference-queries.ts`

| Query key | Источник | ~Строк | Описание |
|-----------|----------|--------|----------|
| `['companies']` | `getCompanies()` | 8 | Предприятия |
| `['departments']` | `departments` table | 4 | Отделы |
| `['processes']` | `processes` table | 13 | Процессы |
| `['employees']` | `v_user_details` view | 21 | Сотрудники |
| `['projects']` | `v_projects_with_departments` | 47 | Проекты |
| `['measures']` | `v_kpi_operational` | 96 | Мероприятия (KPI) |

**Как использовать:**
```tsx
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { companiesQueryOptions } from '@/lib/queries/reference-queries';

// Чтение из кеша (0 запросов при повторном рендере)
const { data: companies = [], isLoading } = useQuery(companiesQueryOptions);

// Инвалидация после мутации
const queryClient = useQueryClient();
await queryClient.invalidateQueries({ queryKey: ['companies'] });

// Оптимистичное обновление (без повторного запроса к БД)
queryClient.setQueryData<Company[]>(['companies'], (prev) =>
  prev ? prev.filter(c => c.company_id !== deletedId) : []
);

// Доступ к кешу из другого хука (из кеша или 1 запрос если пусто)
const measures = await queryClient.ensureQueryData(measuresQueryOptions);
```

#### Данные с TTL (staleTime < Infinity)

Для данных, которые меняются чаще (активности, задачи):
```tsx
const { data } = useQuery({
  queryKey: ['activity-feed', userId, period],
  queryFn: async () => { /* ... */ },
  staleTime: 2 * 60 * 1000,  // 2 минуты
  refetchOnMount: true,        // перезапрос если stale
});
```

#### Планы — оптимизация через view

Часы и количество задач для месячных планов берутся из view `v_monthly_plan_hours`
(агрегация ~21K строк daily_tasks → ~120 строк).

```tsx
// ❌ НЕЛЬЗЯ: прямой запрос к daily_tasks для агрегации часов
const { data } = await supabase.from('daily_tasks').select('spent_hours')...

// ✅ ПРАВИЛЬНО: через view
const { data } = await supabase
  .from('v_monthly_plan_hours')
  .select('monthly_plan_id, total_spent_hours, tasks_count')
  .in('monthly_plan_id', planIds);
```

**Исключение:** если нужны per-task данные (user_id, task_date для pivot-таблиц) —
допустимо обращаться к `daily_tasks` напрямую (пример: `summary/route.ts`, task CRUD).

### 2. API Routes (сервер) — service-role

```ts
import { isRequestAuthorized, getDbUserId } from '@/lib/api/request-guards';

// 1. Проверка авторизации
if (!isRequestAuthorized(req)) return 401;

// 2. User ID из httpOnly cookie (НЕ из JWT — это Azure OID!)
const userId = getDbUserId(req);

// 3. Service-role клиент (обходит RLS)
const db = getDb(); // lazy singleton

// 4. Запросы с привязкой к пользователю
const { data } = await db.from('table').select('*').eq('user_id', userId);
```

**Важно:**
- `getDbUserId(req)` → DB user_id из cookie `x-user-id` (правильный)
- `getUserIdFromToken()` → Azure AD OID (**НЕ использовать для запросов к БД**)
- Клиентский `supabase` из `@/lib/supabase` на сервере **не имеет сессии** → RLS блокирует
- Если body/query передаёт userId — сверить с cookie, иначе 403
- Референс: `src/lib/api/request-guards.ts`, `src/app/api/plans/count/route.ts`

### 3. Модули планов (бизнес-логика)

Файлы: `src/modules/plans/read.ts`, `write.ts`, `delete.ts`, `status.ts`

- Используют клиентский `supabase` (с RLS, от имени пользователя)
- Часы из `v_monthly_plan_hours` view (не daily_tasks)
- Маппинг: `src/modules/plans/monthly-mappers.ts`

### 4. Глобальные настройки QueryProvider

Файл: `src/providers/QueryProvider.tsx`

- `staleTime: Infinity` — справочники "вечно свежие"
- `refetchOnWindowFocus: false` — без рефетча при фокусе
- `refetchOnMount: false` — без рефетча при монтировании
- `retry: 1` (кроме 401/PGRST301 — без ретрая)

Хуки с другим TTL переопределяют `staleTime` и `refetchOnMount` локально.

### Шпаргалка

| Задача | Решение |
|--------|---------|
| Прочитать справочник | `useQuery(xxxQueryOptions)` |
| Мутация + обновление | `supabase.from().update()` → `invalidateQueries()` |
| Оптимистичное удаление | `queryClient.setQueryData<Type[]>()` |
| Часы по планам (агрегат) | `v_monthly_plan_hours` view |
| Per-task данные | `daily_tasks` напрямую (summary, CRUD) |
| API route запрос | `getDb()` (service-role) + `getDbUserId(req)` |
| Кеш из другого хука | `queryClient.ensureQueryData(queryOptions)` |

---

## KPI — формулы и расчёт

### Основная формула

```
KPI = (факт_часы / план_часы) × 100%
```

### Норма и ёмкость

- **Ёмкость сотрудника** (100%) = рабочие дни (Пн-Пт) × 8 часов − пропорциональный отпуск
- **Норма** (70%) = ёмкость × `KPI_NORM / 100` — реалистичный план (сколько ожидается залогировать)
- **План в monthly_plans** = норма. Плановые часы в планах уже представляют 70% ёмкости
- **Отпуск:** 24 календарных дня/год → ~17.14 рабочих дней/год, пропорционально периоду

### Расчёт ёмкости за период

```typescript
// Рабочие дни: только Пн-Пт, без праздников
// Текущий месяц: считаем только до сегодняшнего дня (не весь месяц)
// Прошлые месяцы: полные
// Будущие месяцы: исключены (availableMonths фильтрует m <= currentMonth)

fullCapacity = getAvailableHours(year, availableMonths)
// Внутри: (рабочие_дни − отпуск_пропорционально) × 8

employeeNormHours = fullCapacity × 70%    // для плана сотрудника, KPI знаменатель
employeeCapacityHours = fullCapacity × 100% // для bench отдела
```

### Пример (12 февраля 2026)

| | Январь | Февраль (до 12-го) | Итого |
|--|--------|---------------------|-------|
| Рабочие дни | 22 | 9 | 31 |
| Отпуск (пропорц.) | — | — | ~2.0 |
| Чистые дни | — | — | ~29.0 |
| Ёмкость (×8ч) | — | — | ~232ч |
| **Норма (×70%)** | — | — | **~162ч** |

### Пороги KPI (design-system.ts: `getKPIStatus`)

| Статус | Условие (KPI%) | Цвет | Значение |
|--------|----------------|------|----------|
| `exceeds` | ≥130% | Amber `#f59e0b` | Перевиконання — повод для анализа |
| `good` | ≥100% | Green `#10b981` | Норма выполнена |
| `warning` | ≥70% | Orange `#fb923c` | Нижче норми |
| `critical` | <70% | Red `#ef4444` | Критично |

### Три уровня KPI

| Уровень | Роль | Период | План (знаменатель) | Факт (числитель) |
|---------|------|--------|---------------------|-------------------|
| Процесний | `employee` | Місяць | `employeeNormHours` (calendar × 70%) | Часы из задач сотрудника |
| Операційний | `head` | Квартал | Сумма `planned_hours` из планов отдела | Сумма часов задач отдела |
| Стратегічний | `chief` | Рік | Сумма `planned_hours` всех планов | Сумма часов всех задач |

### Bench (нормо-ёмкость)

```
bench = кол-во_уникальных_сотрудников × employeeNormHours (70%)
```

Bench показывает сколько нормо-часов дают сотрудники отдела/процесса.
Рассчитывается и для `byDepartment`, и для `byProcess`.
Сравнение plan vs bench показывает загруженность: plan ≈ bench = полная утилизация.

### Ключевые файлы

- API: `src/app/api/kpi/route.ts`
- Hook: `src/hooks/useKPI.ts`
- Оркестратор: `src/components/dashboard/content/KPIContent.tsx`
- Views по ролям: `src/components/dashboard/content/kpi/ProcessKPIView.tsx`, `OperationalKPIView.tsx`, `StrategicKPIView.tsx`
- Shared: `KPIGauge.tsx`, `KPIProgressBar.tsx`, `KPIStatusBadge.tsx`, `ProcessEfficiencyChart.tsx`
- Пороги/цвета: `src/styles/design-system.ts` → `kpi.getKPIStatus()`, `kpi.getColor()`

---

## Ключевые участки кода

- Оболочка приложения: `src/app/page.tsx`
- Маппинг разделов: `src/components/dashboard/sections/index.tsx`
- Верхняя навигация: `src/components/navigation/HorizontalNav.tsx`
- UI планов: `src/components/plans/PlansContent.tsx`
- Авторизация: `src/lib/auth/index.ts`, `src/lib/auth/config.ts`
- Middleware: `src/middleware.ts`
- Доменные модули планов:
  `src/modules/plans/read.ts`, `src/modules/plans/write.ts`,
  `src/modules/plans/delete.ts`, `src/modules/plans/status.ts`
- Отчеты:
  `src/lib/services/report-service.ts`,
  `src/lib/services/monthly-report.service.ts`,
  `src/lib/services/pdf-report.service.ts`
- Задачи и файлы:
  `src/components/dashboard/Tasks/TaskFileUpload.tsx`,
  `src/app/api/files/extract-text/route.ts`,
  `src/lib/utils/document-number.ts`

## Задачи и вложения

### Загрузка файлов
- Компонент: `src/components/dashboard/Tasks/TaskFileUpload.tsx`
- Загрузка в SharePoint: `src/services/graph/sharepoint-service.ts`
- Допустимые форматы: `.docx`, `.doc`, `.pdf`, `.xlsx`, `.xls`, `.txt`

### Извлечение текста для AI-ассистента
- **`.docx`** — клиентский парсинг (JSZip → `word/document.xml`)
- **`.doc`** — серверный API `/api/files/extract-text` (`word-extractor`)
- Извлечённый текст передаётся AI-ассистенту (`/api/ai/task-assistant`)
- Автоматическое извлечение номера СЗ: `src/lib/utils/document-number.ts`

### AI-ассистент задач
- API: `src/app/api/ai/task-assistant/route.ts`
- Текст документа обрезается до 3000 символов перед отправкой в AI

## Команды

- Запуск (HTTP): `npm run dev`
- Запуск (HTTPS): `npm run dev:https`
- Сборка: `npm run build`
- Линт: `npm run lint`
- E2E: `npm run test:e2e`

## E2E примечания

- Тесты: `tests/e2e/*`.
- Авторизация в тестах подготавливается через cookie/localStorage (fixtures/setup).
- Если сервер уже запущен: `PLAYWRIGHT_SKIP_SERVER=true`.

## Карта документации

- Бизнес-требования: `docs/BUSINESS_REQUIREMENTS.md`
- Схема БД: `docs/database/SCHEMA.md`
- Использование БД: `docs/database/TABLES_USAGE.md`
- Модуль авторизации: `docs/modules/auth/authentication.md`
- Модуль проектов: `docs/modules/projects/README.md`
- UI-стандарт: `docs/TWO_PANEL_TAB_STANDARD.md`
- Индекс docs: `docs/readme.md`





