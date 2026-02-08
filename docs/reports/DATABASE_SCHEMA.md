# Database Schema: Звіти

## Views

### v_monthly_company_report

Базова агрегація задач по компаніях за місяць.

```sql
CREATE OR REPLACE VIEW v_monthly_company_report AS
SELECT
    c.company_id,
    c.company_name,
    EXTRACT(YEAR FROM wt.completed_at)::INTEGER AS period_year,
    EXTRACT(MONTH FROM wt.completed_at)::INTEGER AS period_month,
    COUNT(DISTINCT wt.weekly_tasks_id) AS tasks_count,
    COALESCE(SUM(wt.spent_hours), 0) AS total_hours,
    COUNT(DISTINCT wt.user_id) AS employees_count,
    COUNT(DISTINCT wp.weekly_id) AS plans_count
FROM companies c
JOIN weekly_plan_companies wpc ON c.company_id = wpc.company_id
JOIN weekly_plans wp ON wpc.weekly_id = wp.weekly_id
JOIN weekly_tasks wt ON wp.weekly_id = wt.weekly_plan_id
WHERE wt.completed_at IS NOT NULL
GROUP BY c.company_id, c.company_name,
         EXTRACT(YEAR FROM wt.completed_at),
         EXTRACT(MONTH FROM wt.completed_at);
```

### v_monthly_employee_report

Базова агрегація задач по співробітниках за місяць.

```sql
CREATE OR REPLACE VIEW v_monthly_employee_report AS
SELECT
    up.user_id,
    up.full_name,
    up.email,
    d.department_id,
    d.department_name,
    EXTRACT(YEAR FROM wt.completed_at)::INTEGER AS period_year,
    EXTRACT(MONTH FROM wt.completed_at)::INTEGER AS period_month,
    COUNT(DISTINCT wt.weekly_tasks_id) AS tasks_count,
    COALESCE(SUM(wt.spent_hours), 0) AS total_hours,
    COUNT(DISTINCT wp.weekly_id) AS plans_count
FROM user_profiles up
JOIN departments d ON up.department_id = d.department_id
JOIN weekly_tasks wt ON up.user_id = wt.user_id
JOIN weekly_plans wp ON wt.weekly_plan_id = wp.weekly_id
WHERE wt.completed_at IS NOT NULL
GROUP BY up.user_id, up.full_name, up.email,
         d.department_id, d.department_name,
         EXTRACT(YEAR FROM wt.completed_at),
         EXTRACT(MONTH FROM wt.completed_at);
```

---

## RPC Functions

### get_company_report_data

**Призначення:** Отримання всіх даних для PDF звіту компанії.

**Параметри:**
| Параметр | Тип | Опис |
|----------|-----|------|
| p_company_id | UUID | ID компанії |
| p_year | INTEGER | Рік звіту |
| p_month | INTEGER | Місяць звіту (1-12) |

**Повертає:** JSONB з полями company, period, summary, employees, processes, tasks

**Ключові особливості:**

1. **employees** - з розбивкою по відділах:
```sql
SELECT jsonb_build_object(
    'user_id', up.user_id,
    'full_name', up.full_name,
    'department_id', d.department_id,
    'department_name', d.department_name,
    'position', COALESCE(up.position, 'Фахівець'),
    'hours', COALESCE(SUM(wt.spent_hours), 0)
) ...
```

2. **processes** - включає задачі без процесу:
```sql
-- Задачі З процесом
SELECT p.process_id::text, p.process_name, SUM(wt.spent_hours)
...
UNION ALL
-- Задачі БЕЗ процесу
SELECT 'other', 'Інші роботи з забезпечення кібербезпеки', SUM(wt.spent_hours)
WHERE (wp.quarterly_id IS NULL OR qp.process_id IS NULL)
```

3. **tasks** - LIMIT 200, сортування по годинах:
```sql
ORDER BY wt.spent_hours DESC, wt.completed_at DESC
LIMIT 200
```

---

## Зв'язки таблиць

```
companies
    │
    └──< weekly_plan_companies >──┐
                                  │
                          weekly_plans
                                  │
                          ┌───────┴───────┐
                          │               │
                    weekly_tasks    quarterly_plans
                          │               │
                    user_profiles    processes
                          │
                    departments
```

**Шлях до процесу:**
```
weekly_tasks
  → weekly_plans
    → quarterly_plans
      → processes
```

**Задачі без процесу:**
- `weekly_plans.quarterly_id IS NULL` - план не прив'язаний до кварталу
- `quarterly_plans.process_id IS NULL` - квартал не має процесу

---

## Міграції

### Файл: fix_report_include_other_tasks.sql

**Застосування:**
```bash
# Через Supabase Dashboard
# SQL Editor → New Query → Paste → Run

# Або через CLI
psql $DATABASE_URL -f scripts/migrations/fix_report_include_other_tasks.sql
```

**Перевірка:**
```sql
-- Тестовий виклик
SELECT * FROM get_company_report_data(
    'your-company-uuid'::uuid,
    2025,
    12
);

-- Перевірити суму годин
SELECT
    SUM((p->>'hours')::numeric) as total
FROM get_company_report_data('uuid', 2025, 12),
     jsonb_array_elements(processes) p;
```

---

## Індекси (рекомендовані)

```sql
-- Для швидкої агрегації по completed_at
CREATE INDEX idx_weekly_tasks_completed_at
ON weekly_tasks (completed_at)
WHERE completed_at IS NOT NULL;

-- Для фільтрації по компанії
CREATE INDEX idx_weekly_plan_companies_company
ON weekly_plan_companies (company_id);

-- Для join з процесами
CREATE INDEX idx_quarterly_plans_process
ON quarterly_plans (process_id);
```

---

## Troubleshooting

### Проблема: Години не співпадають

**Діагностика:**
```sql
-- Всього годин по компанії
SELECT SUM(wt.spent_hours)
FROM weekly_tasks wt
JOIN weekly_plans wp ON wt.weekly_plan_id = wp.weekly_id
JOIN weekly_plan_companies wpc ON wp.weekly_id = wpc.weekly_id
WHERE wpc.company_id = 'uuid'
  AND wt.completed_at BETWEEN '2025-12-01' AND '2025-12-31';

-- Години по процесах
SELECT
    COALESCE(p.process_name, 'Без процесу') as process,
    SUM(wt.spent_hours) as hours
FROM weekly_tasks wt
JOIN weekly_plans wp ON wt.weekly_plan_id = wp.weekly_id
JOIN weekly_plan_companies wpc ON wp.weekly_id = wpc.weekly_id
LEFT JOIN quarterly_plans qp ON wp.quarterly_id = qp.quarterly_id
LEFT JOIN processes p ON qp.process_id = p.process_id
WHERE wpc.company_id = 'uuid'
  AND wt.completed_at BETWEEN '2025-12-01' AND '2025-12-31'
GROUP BY p.process_name;
```

### Проблема: Пусті відділи

**Діагностика:**
```sql
-- Співробітники без відділу
SELECT up.full_name, up.department_id
FROM user_profiles up
WHERE up.department_id IS NULL;
```
