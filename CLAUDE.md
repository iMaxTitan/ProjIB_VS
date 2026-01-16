# ReportIB - Система управления планами ИБ

## Проект
Система для подразделения информационной безопасности крупного ритейлера.
Управление годовыми/квартальными/недельными планами, задачами, KPI и отчетами.

## Критические правила

### 1. Идентификаторы пользователей
- ВСЕГДА использовать только Supabase `user_id` (UUID)
- НИКОГДА не использовать Azure AD ID для бизнес-логики
- Email - только для поиска/связи с Azure AD

### 2. Работа с данными
- Только через Supabase Views: `v_annual_plans`, `v_quarterly_plans`, `v_weekly_plans`, `v_user_details`
- Мутации данных - только через RPC: `manage_annual_plan`, `manage_quarterly_plan`, `upsert_user_profile`
- departmentId всегда приводить к строке

### 3. Аутентификация
- Двойная система: Azure AD (корпоративная) + Supabase (профили)
- Используется popup-авторизация (loginPopup) - не переключает профиль браузера
- Пользователь должен существовать в ОБЕИХ системах
- Кэширование: пользователь 5 мин, Graph токены 30 мин
- Единственный файл конфигурации: `src/lib/auth/config.ts`

### 4. Структура кода
- UI-компоненты: `src/components/` (без бизнес-логики)
- Логика: `src/lib/` и `src/services/`
- Типы: `src/types/`
- Страницы: `src/app/` (App Router)

## Команды
- **Запуск (HTTPS)**: `npm run dev:https` — ОБЯЗАТЕЛЬНО для Azure AD авторизации!
- Запуск (HTTP): `npm run dev` — только для тестов без авторизации
- Сборка: `npm run build`
- Проверка типов: `npx tsc --noEmit`

**ВАЖНО**: Azure AD требует HTTPS. Проект доступен по адресу: https://maxtitan.me:3000

## Текущий приоритет: Исправление критических багов

### Исправленные проблемы ✅
1. **Дублирование файлов** - УДАЛЕНО:
   - `src/lib/msalAuth.ts` ✅
   - `src/lib/plan-service.ts` ✅
   - `src/lib/msal.ts` ✅
   - `src/lib/config/authConfig.ts` ✅
   - `src/app/auth/` (страница redirect callback) ✅

2. **Неправильные импорты планов** - ИСПРАВЛЕНО:
   - Используется: `@/lib/plans/plan-service`

3. **Система аутентификации** - ИСПРАВЛЕНО ✅:
   - Вход: popup-авторизация (не переключает профиль браузера)
   - Выход: локальный (без открытия окон Microsoft)
   - Единственная точка входа: `src/lib/auth/index.ts`
   - Документация: `docs/modules/auth/authentication.md`

### Оставшиеся проблемы
1. **Модуль задач** (`src/lib/tasks/task-service.ts`):
   - Минимальная реализация (только getTasksByWeeklyPlanId)
   - Требуется: createTask, updateTask, deleteTask, changeTaskStatus

2. **Сервис сотрудников**:
   - Отсутствует! Логика размазана по компонентам
   - Создать: `src/lib/services/employees.service.ts`

### Архитектурные проблемы
- Props Drilling user через 5+ уровней компонентов
- Большие компоненты (300+ строк) - разбить
- Дублирование кода в модальных окнах планов (~180 строк)
- Кастомный KPIStore вместо Zustand

## Иерархия планов (ВАЖНО!)

Связи между планами **ОПЦИОНАЛЬНЫЕ**:

```
┌─────────────────────────────────────────────────────────────────┐
│  Годовой план (annual_plan_id = NULL — внеплановый)             │
│    └─► Квартальный план (может быть привязан ИЛИ внеплановый)   │
│          └─► Недельный план (может быть привязан ИЛИ внеплановый)│
│                └─► Задачи (обязательно привязаны к недельному)   │
└─────────────────────────────────────────────────────────────────┘
```

**Сценарии:**
- Квартальный план БЕЗ привязки к годовому — срочные/незапланированные работы
- Недельный план БЕЗ привязки к квартальному — оперативные задачи
- Задача ВСЕГДА привязана к недельному плану

**В интерфейсе:**
- Планы с привязкой показывать в иерархии (drill-down)
- Внеплановые — в отдельной секции "Внеплановые"

## Модули системы
1. **Авторизация** (`src/lib/auth/`) - Azure AD + Supabase
2. **Планы** (`src/lib/plans/`) - годовые/квартальные/недельные
3. **Задачи** (`src/lib/tasks/`) - привязка к недельным планам
4. **Сотрудники** (`src/components/employees/`) - управление профилями
5. **KPI** (`src/components/dashboard/kpi/`) - показатели эффективности
6. **Компании** (`src/components/dashboard/companies/`) - партнеры
7. **Отчеты** (`src/lib/services/report-service.ts`) - формирование отчетов

## База данных (Supabase)

> **Полная документация**: [docs/database/SCHEMA.md](docs/database/SCHEMA.md)

### Ключевые таблицы
- `user_profiles` - профили (связь с Azure AD по email)
- `annual_plans`, `quarterly_plans`, `weekly_plans` - планы
- `weekly_tasks` - задачи
- `departments`, `processes` - справочники
- `companies` - компании-партнеры
- `kpi_metrics`, `kpi_values` - KPI

### Views (только чтение)
- `v_user_details` - детали пользователя
- `v_annual_plans`, `v_quarterly_plans`, `v_weekly_plans` - планы с агрегацией
- `v_active_weekly_plans` - активные недельные планы с задачами
- `v_kpi_current` - текущие значения KPI

### RPC функции (мутации)
- `manage_annual_plan(p_action, p_user_id, p_year, p_goal, p_status, ...)`
- `manage_quarterly_plan(p_action, ...)`
- `manage_weekly_plan(p_action, p_assignees, ...)`
- `manage_weekly_task(_weekly_tasks_id, _weekly_plan_id, _user_id, ...)`
- `upsert_user_profile(p_email, p_full_name, p_role, p_status, p_department_id)`

## Роли пользователей

### Chief (Шеф) — стратегический руководитель
- НЕ создаёт планы
- Утверждает/отклоняет ВСЕ планы (годовые, квартальные, недельные)
- Видит ВСЁ: все отделы, все планы, audit log

### Head (Начальник отдела) — тактический руководитель
- Создаёт планы СВОЕГО отдела (годовые, квартальные, недельные)
- Отправляет на утверждение Chief
- Подтверждает задачи сотрудников
- Чужие отделы — только чтение

### Employee (Сотрудник) — исполнитель
- НЕ создаёт планы
- Создаёт задачи в назначенных АКТИВНЫХ недельных планах
- Видит только свои задачи и планы

## Документация
- **Бизнес-ТЗ**: [docs/BUSINESS_REQUIREMENTS.md](docs/BUSINESS_REQUIREMENTS.md) ⭐
- Архитектура: [docs/architecture/README.md](docs/architecture/README.md)
- База данных: [docs/database/SCHEMA.md](docs/database/SCHEMA.md)
- Аутентификация: [docs/modules/auth/authentication.md](docs/modules/auth/authentication.md)
- Анализ проблем: [docs/PROJECT_ANALYSIS_REPORT.md](docs/PROJECT_ANALYSIS_REPORT.md)
- Модули: docs/modules/*/README.md
- Правила разработки: [docs/ai-instructions.md](docs/ai-instructions.md)

## Навигация и интерфейс

### Текущая реализация — Горизонтальные вкладки (notebook-style)

**Главная навигация дашборда:**
- Горизонтальные вкладки в стиле блокнота (notebook tabs)
- Вкладки с закруглёнными углами сверху (`rounded-t-lg`)
- Активная вкладка: белый фон, тень, перекрывает нижнюю границу
- Всё работает на одном URL `/dashboard` — без переходов

**Порядок вкладок:**
```
Chief:    Активность → Планы → Задачи → Отчеты → KPI → Сотрудники → Предприятия → Коэффициенты
Head:     Активность → Планы → Задачи → Отчеты → KPI → Сотрудники → Коэффициенты
Employee: Активность → Планы → Задачи → Отчеты → KPI → Коэффициенты
```

**Вкладки планов (PlansPageNew):**
- Годы: amber цвет (янтарный)
- Кварталы: purple цвет (фиолетовый)
- Недели: indigo цвет (индиго)
- Индикаторы времени: зелёный (текущий), серый (прошлый), синий (будущий)

**Ключевые файлы:**
- `src/components/navigation/HorizontalNav.tsx` — главная навигация
- `src/app/dashboard/page.tsx` — контейнер дашборда (управляет currentPath)
- `src/components/plans/PlansPageNew.tsx` — страница планов с вкладками

### Архитектура навигации

```
┌─────────────────────────────────────────────────────────────┐
│  DashboardHeader (шапка с профилем)                          │
├─────────────────────────────────────────────────────────────┤
│  HorizontalNav (вкладки: Активность | Планы | Задачи | ...) │
├─────────────────────────────────────────────────────────────┤
│  DashboardTiles (плитки с count планов — только на главной)  │
├─────────────────────────────────────────────────────────────┤
│  DashboardContent (контент по currentPath)                   │
│    └─ PlansContent / TasksContent / ReportsContent / ...     │
└─────────────────────────────────────────────────────────────┘
```

**Удалённые компоненты:**
- `src/components/sidebar/Sidebar.tsx` — заменён на HorizontalNav
- `src/components/layout/DashboardLayout.tsx` — не используется
- Вкладка "Отдел" — убрана (не нужна)

### Дизайн-система

**Рекомендуемый стек:**
- shadcn/ui (Radix + Tailwind)
- Lucide React иконки
- CSS-переменные для темизации

**Стили вкладок notebook:**
```tsx
// Активная вкладка
"bg-white border-{color}-300 text-{color}-700 shadow-sm z-10 -mb-px"

// Неактивная вкладка
"bg-{color}-50/70 border-{color}-200/50 text-gray-500 hover:bg-{color}-100/70"
```

## Типовые ошибки и решения

### План не создается
- Проверить, что передается корректный Supabase user_id
- НЕ использовать Azure AD ID

### Не отображается автор плана
- View должен возвращать author_name, author_email
- Компонент должен их отображать

### Задача не привязывается к плану
- Проверить связь weekly_plan_id
- Проверить user_id исполнителя

### Ошибка при обновлении профиля
- Использовать только RPC `upsert_user_profile`
- Email нельзя менять после создания
