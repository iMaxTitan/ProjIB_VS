# Месячные планы: архитектура и использование

> Дата: 2026-02-02
> Статус: Реализовано

## 1. Обзор изменений

Система перешла с **недельного планирования** на **месячное планирование**:

| Было (Weekly) | Стало (Monthly) |
|---------------|-----------------|
| Недельный план = описание работы | Месячный план = Услуга |
| weekly_plans | monthly_plans |
| weekly_tasks | daily_tasks |
| Дата недели (monday) | Год + Месяц (1-12) |
| Произвольное описание | Привязка к услуге (service_id) |

## 2. Иерархия планирования

```
┌─────────────────────────────────────────────────────────────┐
│                     ГОДОВОЙ ПЛАН                            │
│  Стратегическая цель подразделения на год                  │
└─────────────────────────┬───────────────────────────────────┘
                          │ 1:N
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   КВАРТАЛЬНЫЙ ПЛАН                          │
│  Тактическая цель на квартал                               │
│  Связь: department_id, process_id                          │
└─────────────────────────┬───────────────────────────────────┘
                          │ 1:N
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    МЕСЯЧНЫЙ ПЛАН                            │
│  ≡ Услуга (service_id обязателен)                          │
│  Год, Месяц (1-12), Плановые часы                          │
│  + Исполнители (monthly_plan_assignees)                    │
│  + Предприятия (monthly_plan_companies)                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ 1:N
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   ЕЖЕДНЕВНАЯ ЗАДАЧА                         │
│  Факт выполненной работы                                   │
│  task_date, spent_hours, description                       │
└─────────────────────────────────────────────────────────────┘
```

## 3. Матрица связей: Процессы → Услуги → Планы

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ DEPARTMENTS │────►│  PROCESSES   │────►│    SERVICES     │
│   Отделы    │     │   Процессы   │     │     Услуги      │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                  │
                                                  ▼
                                         ┌─────────────────┐
                                         │  MONTHLY_PLANS  │
                                         │ Месячные планы  │
                                         └─────────────────┘
```

### Пример данных:

| Отдел | Процесс | Услуга |
|-------|---------|--------|
| ОКБ | Управління безпекою обчислювальних систем | Антивірусний захист |
| ОКБ | Управління безпекою обчислювальних систем | Оновлення ПЗ серверів |
| ОКБ | Управління безпекою мережі | Налаштування firewall |
| СМУР | Моніторинг та реагування | Аналіз інцидентів |
| СМУР | Моніторинг та реагування | Реагування на загрози |

## 4. Структура базы данных

### 4.1. Таблица monthly_plans

```sql
CREATE TABLE monthly_plans (
  monthly_plan_id UUID PRIMARY KEY,
  quarterly_id UUID REFERENCES quarterly_plans,
  service_id UUID REFERENCES services NOT NULL, -- Услуга обязательна!
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  title TEXT, -- Может быть пустым, т.к. есть service_name
  description TEXT,
  status plan_status NOT NULL DEFAULT 'draft',
  planned_hours NUMERIC DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2. Таблица services

```sql
CREATE TABLE services (
  service_id UUID PRIMARY KEY,
  process_id UUID REFERENCES processes,
  name TEXT NOT NULL,       -- Название услуги
  description TEXT,
  is_active BOOLEAN DEFAULT true
);
```

### 4.3. Таблица daily_tasks

```sql
CREATE TABLE daily_tasks (
  daily_task_id UUID PRIMARY KEY,
  monthly_plan_id UUID REFERENCES monthly_plans NOT NULL,
  user_id UUID REFERENCES user_profiles NOT NULL,
  task_date DATE NOT NULL,  -- Дата выполнения
  description TEXT NOT NULL,
  spent_hours NUMERIC NOT NULL,
  attachment_url TEXT,
  document_number TEXT,     -- Номер СЗ
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.4. Связующие таблицы

```sql
-- Исполнители месячного плана
CREATE TABLE monthly_plan_assignees (
  monthly_plan_id UUID REFERENCES monthly_plans,
  user_id UUID REFERENCES user_profiles,
  PRIMARY KEY (monthly_plan_id, user_id)
);

-- Предприятия месячного плана
CREATE TABLE monthly_plan_companies (
  monthly_plan_id UUID REFERENCES monthly_plans,
  company_id UUID REFERENCES companies,
  PRIMARY KEY (monthly_plan_id, company_id)
);
```

## 5. Логика создания месячного плана

### 5.1. Из квартального плана (плюсик)

1. Пользователь нажимает "+" на квартальном плане
2. Создаётся план с `quarterly_id` = ID выбранного квартала
3. Показываются только месяцы этого квартала (Q1: 1-3, Q2: 4-6, ...)
4. Поле `service_id` обязательно

### 5.2. Внеплановый месячный план

1. Создаётся без привязки к кварталу (`quarterly_id = NULL`)
2. Доступны все 12 месяцев
3. Поле `service_id` обязательно

## 6. Раздел "Задачи" (Tasks)

### 6.1. Фильтрация планов по ролям

| Роль | Видит планы |
|------|-------------|
| Chief | Все месячные планы |
| Head | Планы своего отдела |
| Employee | Только назначенные планы |

### 6.2. Добавление задач

- Задача создаётся в `daily_tasks`
- Привязка: `monthly_plan_id`, `user_id`, `task_date`
- Валидация: сумма часов за день ≤ 8

## 7. Цветовая схема в интерфейсе

| Тип плана | Цвет фона | Цвет градиента |
|-----------|-----------|----------------|
| Годовой | amber-50 | amber-500 → orange-500 |
| Квартальный | purple-50 | purple-500 → pink-500 |
| **Месячный** | **indigo-50** | **indigo-500 → blue-500** |

## 8. Компоненты React

### 8.1. Планы

- `PlansPageNew.tsx` — основная страница планов
- `PlanTree.tsx` — дерево планов (иерархия)
- `MonthlyPlanDetails.tsx` — карточка месячного плана (inline edit)
- `PlansLayout.tsx` — layout с ресайзом панелей

### 8.2. Задачи

- `page-new.tsx` — страница задач
- `PlanListSidebar.tsx` — список месячных планов
- `WorkLogViewer.tsx` — журнал работ по плану
- `AddTaskModal.tsx` — модалка добавления/редактирования задачи

### 8.3. Сервисы

- `usePlans.ts` — хук для работы с планами
- `task-service.ts` — функции для работы с задачами:
  - `getTasksByMonthlyPlanId()` — задачи плана
  - `getDailyTasksSpentHours()` — часы за день

## 9. Преимущества нового подхода

1. **Стандартизация** — план = услуга из каталога
2. **Удобство отчётности** — группировка по услугам
3. **Масштабирование** — легко добавить новые услуги
4. **Связь с процессами** — автоматическое определение отдела
5. **Гибкость** — месячная детализация вместо недельной

## 10. Удаление планов

### 10.1. Правила удаления

| Правило | Описание |
|---------|----------|
| Только создатель | Удалить план может только его автор (`created_by`) |
| Иерархия | Сначала удалите дочерние планы |
| Каскад | При удалении месячного — удаляются задачи, назначения, компании |

### 10.2. Функции (plan-service.ts)

```typescript
// Проверка возможности удаления
canDeleteMonthlyPlan(monthlyPlanId, userId): Promise<{
  canDelete: boolean;
  reason?: string;
  childCount?: number;  // Количество задач
}>

// Удаление (с каскадом)
deleteMonthlyPlan(monthlyPlanId, userId): Promise<{
  success: boolean;
  error?: string;
  deletedTasks?: number;
}>
```

### 10.3. UI

- Кнопка 🗑️ в шапке `MonthlyPlanDetails`
- Неактивна если нельзя удалить (tooltip с причиной)
- Подтверждение: "Удалить?" → ✓ / ✗

---

## Связанная документация

- [SCHEMA.md](../database/SCHEMA.md) — схема БД
- [DEVELOPER_GUIDE.md](../DEVELOPER_GUIDE.md) — гайд разработчика
- [BUSINESS_REQUIREMENTS.md](../BUSINESS_REQUIREMENTS.md) — требования
