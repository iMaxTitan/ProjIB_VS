# План оптимизации работы с БД (v3)

## Контекст

Каждый хук делает самостоятельный запрос к Supabase при монтировании. Нет кеширования, нет дедупликации. Справочники (~140 записей) перезагружаются при каждом переходе между разделами.

Главный bottleneck: `usePlans` загружает **ВСЕ ~21K daily_tasks** ради агрегации `spent_hours`. Должно быть на уровне БД.

Источник: [SCHEMA.md](docs/database/SCHEMA.md). Перед SQL-изменениями — верифицировать через Supabase Dashboard.

---

## Фаза 0: Подготовка — React types + зачистка мёртвого кода

### Шаги:
1. `npm install @types/react@^19 @types/react-dom@^19` — фикс несоответствия react 19 / types 18
2. `npm run typecheck`
3. Удалить [PlansContext.tsx](src/context/PlansContext.tsx) + убрать `<PlansProvider>` из [page.tsx](src/app/page.tsx) — мёртвый код, `usePlansContext` нигде не используется
4. Удалить `getServices()` и тип `Service` из [read.ts](src/modules/plans/read.ts) — мёртвый код, нигде не вызывается
5. В Supabase Dashboard: `DROP TABLE IF EXISTS services CASCADE;` + убрать из [SCHEMA.md](docs/database/SCHEMA.md)

### Файлы:
- **Удалить:** `src/context/PlansContext.tsx`
- **Изменить:** [page.tsx](src/app/page.tsx), [read.ts](src/modules/plans/read.ts), [planning.ts](src/types/planning.ts)
- **Обновить:** [SCHEMA.md](docs/database/SCHEMA.md) — убрать services

---

## Фаза 1: TanStack Query — инфраструктура

### Шаги:
1. `npm install @tanstack/react-query`
2. Создать `src/providers/QueryProvider.tsx`:
   ```ts
   staleTime: Infinity,  // по умолчанию — не рефетчить
   retry: (failureCount, error) => {
     if (error?.code === 'PGRST301' || error?.status === 401) return false;
     return failureCount < 1;
   },
   refetchOnWindowFocus: false,
   ```
3. Обернуть в [page.tsx](src/app/page.tsx) вместо PlansProvider
4. DevTools — только в dev через `lazy(() => import(...))`

### Файлы:
- **Создать:** `src/providers/QueryProvider.tsx`
- **Изменить:** [page.tsx](src/app/page.tsx)

---

## Фаза 2: SQL-оптимизация (Supabase Dashboard → SQL Editor)

### 2.1 — View: v_monthly_plan_hours

```sql
CREATE INDEX IF NOT EXISTS idx_daily_tasks_monthly_plan_id
  ON daily_tasks (monthly_plan_id);

CREATE VIEW v_monthly_plan_hours AS
SELECT
  monthly_plan_id,
  COALESCE(SUM(spent_hours), 0) AS total_spent_hours,
  COUNT(*) AS tasks_count
FROM daily_tasks
GROUP BY monthly_plan_id;

ALTER VIEW v_monthly_plan_hours SET (security_invoker = on);
GRANT SELECT ON v_monthly_plan_hours TO authenticated;
```

~120 строк вместо ~21,000. Обычный view — GROUP BY на 21K строк ~5ms, materialized не нужен.

### 2.2 — Partial index для v_activity_feed

```sql
CREATE INDEX IF NOT EXISTS idx_activities_target_daily_task
  ON activities (target_type, target_id)
  WHERE target_type = 'daily_task';
```

### После применения:
- `SELECT * FROM v_monthly_plan_hours LIMIT 10` → проверить
- Обновить [SCHEMA.md](docs/database/SCHEMA.md) — view + индексы + timestamp

---

## Фаза 3: Оптимизация usePlans

### 3.1 — daily_tasks → v_monthly_plan_hours

В [usePlans.ts](src/hooks/usePlans.ts), **два места**:

`loadMonthlyPlansByQuarterlyIds` (строка 58):
```ts
// Было: supabase.from('daily_tasks').select('monthly_plan_id, spent_hours')
// Стало: supabase.from('v_monthly_plan_hours').select('*')
```

`refreshPlans` (строка 279):
```ts
// Было: supabase.from('daily_tasks').select('monthly_plan_id, spent_hours')
// Стало: supabase.from('v_monthly_plan_hours').select('*')
```

### 3.2 — Упростить monthly-mappers

В [monthly-mappers.ts](src/modules/plans/monthly-mappers.ts):
- `aggregateHoursByMonthlyPlan()` — view уже возвращает `{ monthly_plan_id, total_spent_hours, tasks_count }`, маппер конвертирует массив в Map напрямую

### 3.3 — Measures через кеш

```ts
// Было: supabase.from('v_kpi_operational').select(...) — каждый вызов
// Стало: queryClient.ensureQueryData(measuresQueryOptions) — из кеша
```

### Файлы:
- **Изменить:** [usePlans.ts](src/hooks/usePlans.ts), [monthly-mappers.ts](src/modules/plans/monthly-mappers.ts)

---

## Фаза 4: Кеширование справочников

### 4.1 — Query options (staleTime: Infinity — загрузка при логине)

Создать `src/lib/queries/reference-queries.ts`:

| Query key | Источник | Записей | Примечание |
|-----------|----------|---------|------------|
| `['companies']` | `companies` | 8 | Не меняются |
| `['departments']` | `departments` | 4 | Не меняются |
| `['processes']` | `processes` | 13 | Не меняются |
| `['employees']` | `v_user_details` | 21 | v_user_details = user_profiles + dept name/code. Используется в 7 местах вкл. серверные API. Оставляем view |
| `['projects']` | `v_projects_with_departments` | 47 | Статичны. Только toggleActive → `invalidateQueries` |
| `['measures']` | `v_kpi_operational` | 96 | Shared: usePlans + KPI страница |

Всё `staleTime: Infinity`. После CRUD мутаций — `invalidateQueries` для конкретного ключа.

### 4.2 — Миграция хуков

**Паттерн:** хук = фасад. Внутри `useQuery`, снаружи API не меняется:

```ts
const { data, isLoading, error } = useQuery(processesQueryOptions);
return { processes: data ?? [], loading: isLoading, error: error ? getErrorMessage(error) : null };
```

| Хук | Что меняется |
|-----|-------------|
| [useProcesses.ts](src/hooks/useProcesses.ts) | useState+useEffect → useQuery |
| [useCompanies.ts](src/hooks/useCompanies.ts) | useState+useEffect → useQuery |
| [useEmployees.ts](src/hooks/useEmployees.ts) | useQuery для данных + локальный state (фильтры, expanded). `handleEmployeeUpserted` → `queryClient.setQueryData` |
| [useProjects.ts](src/hooks/useProjects.ts) | useQuery + useMutation(toggleActive) + `invalidateQueries`. Убрать create/update/delete |
| `useProjectsForTask` | thin wrapper: кеш useProjects + useMemo фильтр по dept |

### 4.3 — Activity feed кеш

В [ActivityContent.tsx](src/components/dashboard/content/ActivityContent.tsx) — обернуть `getActivityFeed` в useQuery, `staleTime: 2мин`.

### Файлы:
- **Создать:** `src/lib/queries/reference-queries.ts`
- **Изменить:** хуки выше + [ActivityContent.tsx](src/components/dashboard/content/ActivityContent.tsx)

---

## Порядок

```
Фаза 0 (React types + зачистка services/PlansContext)
    ↓
Фаза 1 (TanStack Query infra)
    ↓
Фаза 2 (SQL: v_monthly_plan_hours + индексы)
    ↓
Фаза 3 (usePlans → view + кеш measures)  ← ГЛАВНЫЙ ВЫИГРЫШ
    ↓
Фаза 4 (Справочники Infinity + activity feed 2мин)
```

---

## Ожидаемый эффект

| Метрика | Было | Станет |
|---------|------|--------|
| daily_tasks в usePlans | ~21,000 строк | ~120 строк |
| Справочники при навигации | 3-5 запросов | 0 (загружены при логине) |
| Дублирование | useCompanies x3, useProcesses xN | 1 запрос за сессию |
| measures в usePlans | каждый раз | из кеша |
| Activity feed | каждый mount | кеш 2мин |
| Мёртвый код | services, PlansContext, getServices() | удалён |

---

## Проверка

1. `npm run typecheck` — после Фазы 0
2. `npm run build` — после каждой фазы
3. Supabase Dashboard → v_monthly_plan_hours корректен
4. DevTools → Network → справочники: 1 запрос за сессию, не при навигации
5. Планы → spent_hours корректны
6. Activity feed → не при каждом переходе
