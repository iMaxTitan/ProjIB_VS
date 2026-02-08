# План реализации: Коэффициенты предприятий

> Дата: 2026-02-02
> Статус: План

## 1. Обзор

**Цель:** Добавить ручные коэффициенты трудоёмкости для каждого предприятия, обновляемые ежемесячно вместе с инфраструктурой.

**Ключевые решения:**
- Коэффициенты хранятся в `company_infrastructure` (обновляются вместе)
- Тип распределения выбирается в месячном плане
- Распределение часов отображается в отчётах

## 2. Существующие типы распределения

Уже реализованы в `types/infrastructure.ts`:

| Код | Название | Описание |
|-----|----------|----------|
| `ATBi7` | АТБи7 | Все 7 предприятий по доле компьютеров |
| `ATBi5` | АТБи5 | 5 предприятий (без КФК и МФФ) по доле ПК |
| `ATB7` | АТБ7 | Поровну на все 7 предприятий (1/7 каждому) |
| `ATB3` | АТБ3 | Поровну на 3 предприятия с серверами (1/3) |

**Добавить:**

| Код | Название | Описание |
|-----|----------|----------|
| `custom` | Вручну | Ручной ввод коэффициента для каждой компании |

## 3. Изменения в базе данных

### 3.1. Расширение company_infrastructure

```sql
-- Добавляем коэффициент трудоёмкости
ALTER TABLE company_infrastructure
ADD COLUMN coefficient NUMERIC(5,4) DEFAULT NULL;

-- Коэффициент от 0.0000 до 1.0000 (процент от 100%)
-- NULL = используется авторасчёт по инфраструктуре

COMMENT ON COLUMN company_infrastructure.coefficient IS
  'Ручной коэффициент трудоёмкости (0-1). NULL = авторасчёт по инфраструктуре';
```

### 3.2. Расширение monthly_plans

```sql
-- Добавляем тип распределения
ALTER TABLE monthly_plans
ADD COLUMN distribution_type TEXT DEFAULT 'ATBi7';

-- Возможные значения: 'ATBi7', 'ATBi5', 'ATB7', 'ATB3', 'custom'

COMMENT ON COLUMN monthly_plans.distribution_type IS
  'Тип распределения часов по компаниям';
```

### 3.3. View для расчёта часов по компаниям

```sql
CREATE OR REPLACE VIEW v_monthly_plan_company_hours AS
SELECT
  mp.monthly_plan_id,
  mp.planned_hours,
  mp.distribution_type,
  mpc.company_id,
  c.company_name,
  ci.workstations_count,
  ci.servers_count,
  ci.coefficient AS manual_coefficient,

  -- Рассчитанные часы на компанию
  CASE mp.distribution_type
    WHEN 'custom' THEN
      -- Ручной коэффициент
      mp.planned_hours * COALESCE(ci.coefficient, 0)
    WHEN 'ATB7' THEN
      -- Поровну на всех
      mp.planned_hours / 7.0
    WHEN 'ATB3' THEN
      -- Поровну на 3 с серверами
      CASE WHEN ci.servers_count > 0 THEN mp.planned_hours / 3.0 ELSE 0 END
    ELSE
      -- По доле ПК (ATBi7, ATBi5)
      mp.planned_hours * (ci.workstations_count::NUMERIC / NULLIF(totals.total_workstations, 0))
  END AS company_planned_hours

FROM monthly_plans mp
JOIN monthly_plan_companies mpc ON mp.monthly_plan_id = mpc.monthly_plan_id
JOIN companies c ON mpc.company_id = c.company_id
LEFT JOIN LATERAL (
  SELECT * FROM company_infrastructure
  WHERE company_id = mpc.company_id
  ORDER BY period_year DESC, period_month DESC
  LIMIT 1
) ci ON true
CROSS JOIN (
  SELECT SUM(latest.workstations_count) AS total_workstations
  FROM companies comp
  LEFT JOIN LATERAL (
    SELECT workstations_count FROM company_infrastructure
    WHERE company_id = comp.company_id
    ORDER BY period_year DESC, period_month DESC
    LIMIT 1
  ) latest ON true
) totals;
```

## 4. Изменения в интерфейсе

### 4.1. InfrastructureModal.tsx

Добавить поле "Коэффициент" под полями серверов и ПК:

```tsx
{/* Коэффициент */}
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Коефіцієнт трудомісткості
  </label>
  <div className="flex items-center gap-2">
    <input
      type="number"
      min="0"
      max="1"
      step="0.01"
      value={coefficient ?? ''}
      onChange={(e) => setCoefficient(e.target.value ? Number(e.target.value) : null)}
      placeholder="Авто"
      className="w-24 border border-gray-300 rounded-lg px-3 py-2"
      disabled={loading}
    />
    <span className="text-sm text-gray-500">
      {coefficient ? `${(coefficient * 100).toFixed(1)}%` : 'Авторозрахунок'}
    </span>
  </div>
  <p className="text-xs text-gray-400 mt-1">
    Від 0 до 1 (наприклад, 0.60 = 60%)
  </p>
</div>
```

### 4.2. CompaniesInfrastructurePage.tsx

Добавить колонку "Коеф." в таблицу:

```tsx
<th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
  Коеф.
</th>

// В строке таблицы:
<td className="px-4 py-4 text-right">
  {company.coefficient ? (
    <span className="text-sm font-medium text-gray-900">
      {(company.coefficient * 100).toFixed(1)}%
    </span>
  ) : (
    <span className="text-xs text-gray-400">авто</span>
  )}
</td>
```

### 4.3. MonthlyPlanDetails.tsx

Добавить выбор типа распределения:

```tsx
{/* Тип распределения */}
<div>
  <label className="text-xs text-gray-500">Розподіл по підприємствам</label>
  <select
    value={distributionType}
    onChange={(e) => setDistributionType(e.target.value)}
    className="w-full border rounded-lg px-3 py-2 text-sm"
  >
    {WORKLOAD_DISTRIBUTION_TYPES.map(dt => (
      <option key={dt.type} value={dt.type}>
        {dt.label} — {dt.description}
      </option>
    ))}
  </select>
</div>
```

## 5. Изменения в типах

### 5.1. types/infrastructure.ts

```typescript
// Добавить тип custom
export type WorkloadDistributionType = 'ATBi7' | 'ATBi5' | 'ATB7' | 'ATB3' | 'custom';

// Добавить в массив
export const WORKLOAD_DISTRIBUTION_TYPES: WorkloadDistributionInfo[] = [
  // ... существующие ...
  {
    type: 'custom',
    label: 'Вручну',
    description: 'Ручний коефіцієнт для кожного підприємства',
    participantsCount: 0
  }
];

// Расширить CompanyWithInfrastructure
export interface CompanyWithInfrastructure extends Company {
  // ... существующие поля ...
  coefficient?: number | null; // Ручной коэффициент
}
```

### 5.2. types/planning.ts

```typescript
// Расширить MonthlyPlan
export interface MonthlyPlan {
  // ... существующие поля ...
  distribution_type?: WorkloadDistributionType;
}
```

## 6. Порядок реализации

### Этап 1: База данных
- [ ] Миграция: добавить coefficient в company_infrastructure
- [ ] Миграция: добавить distribution_type в monthly_plans
- [ ] Обновить view v_companies_with_infrastructure
- [ ] Обновить RPC manage_company_infrastructure

### Этап 2: Типы и сервисы
- [ ] Обновить types/infrastructure.ts
- [ ] Обновить types/planning.ts
- [ ] Обновить infrastructure.service.ts

### Этап 3: UI - Компании
- [ ] Добавить поле coefficient в InfrastructureModal
- [ ] Добавить колонку Коеф. в таблицу компаний
- [ ] Обновить детальную панель компании

### Этап 4: UI - Месячные планы
- [ ] Добавить выбор distribution_type в MonthlyPlanDetails
- [ ] Сохранять distribution_type при создании/редактировании

### Этап 5: Отчётность
- [ ] Создать view v_monthly_plan_company_hours
- [ ] Добавить распределение часов в отчёт

## 7. Пример использования

### Сценарий: Создание месячного плана

1. Head создаёт месячный план:
   - Услуга: "Антивірусний захист"
   - Плановые часы: 100
   - Тип распределения: **ATBi7** (по доле ПК)

2. Система автоматически рассчитывает:
   ```
   АТБ Маркет: 100 × 0.60 = 60 часов
   АТБ Енерго: 100 × 0.18 = 18 часов
   Корпорація: 100 × 0.10 = 10 часов
   Інші:       100 × 0.12 = 12 часов
   ```

3. В отчёте показывается:
   ```
   | Підприємство    | Коеф. | План | Факт |
   |-----------------|-------|------|------|
   | АТБ Маркет      | 60%   | 60ч  | 55ч  |
   | АТБ Енерго      | 18%   | 18ч  | 20ч  |
   ...
   ```
