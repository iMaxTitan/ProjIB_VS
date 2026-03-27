# Plans V2 — Матрица панелей

> Як будуються три панелі залежно від фільтрів (scope) та вибору в сайдбарі.
> Оновлено: 2026-03-27

## Фільтри

- **Рік** — квартал і місяць не вибрані
- **Квартал** — квартал вибраний, місяць ні
- **Місяць** — місяць вибраний (квартал автоматично)

Місяці завжди видимі (3 шт з поточного або вибраного кварталу). Статус-фільтри прибрані.

---

## Середня панель

| Scope | Нічого | Процесс | Процедура |
|-------|--------|---------|-----------|
| **Рік** | AnnualListView | ProcessDetailView | ProcedureDetailPanel |
| **Квартал** | QuarterlyListView | ProcessDetailView | ProcedureDetailPanel |
| **Місяць** | MonthlyPlansListView | ProcessDetailView | ProcedureDetailPanel |

---

## Права панель

| Scope | Нічого | Процесс / Процедура |
|-------|--------|---------------------|
| **Рік** | EmptyState | EmployeeTasksPanel |
| **Квартал** | EmptyState | EmployeeTasksPanel |
| **Місяць** | MonthlyUsersView | EmployeeTasksPanel |

---

## Статуси планів

| DB value | Укр | Колір | Іконка (lucide) |
|----------|-----|-------|-----------------|
| — (немає плану) | Немає плану | gray | `Ban` |
| `pending` | Не затверджено | amber | `Hourglass` |
| `active` | В роботі | indigo | `Zap` |
| `done` | Виконано | green | `CheckCheck` |

Флоу: немає → створити → `pending` → затвердити → `active` → прийняти → `done`

---

## Кнопки дій

### Списки (AnnualListView, QuarterlyListView, MonthlyPlansListView)

| Статус | Plus (+) | Copy | Check (✓) | X (✗) chief only |
|--------|----------|------|-----------|-------------------|
| Немає плану | створити порожній | копіювати з попереднього | — | — |
| `pending` | — | — | → `active` | видалити план |
| `active` | — | — | → `done` | → `pending` |
| `done` | — | — | disabled | → `active` |

Копіювання:
- Рік: копіює expected_result + бюджетні статті з попереднього року
- Квартал: копіює expected_result + note + ініціативи з попереднього кварталу
- Місяць: копіює години, опис, distribution_type, компанії, проєкти, документи, виконавців

### Іконки дій

| Дія | Іконка | Колір |
|-----|--------|-------|
| Створити | `Plus` | green |
| Копіювати | `Copy` | indigo |
| Затвердити/Прийняти | `Check` | green |
| Відхилити/Повернути/Видалити | `X` | red |
| Редагувати | `Pencil` | indigo |
| Видалити | `Trash2` | red |

---

## ProcessDetailView — наборний по scope

Один компонент, секції з'являються залежно від рівня.

| Секція | Рік | Квартал | Місяць |
|--------|:---:|:-------:|:------:|
| Опис + Місія + Результат | ✓ | ✓ | ✓ |
| Бюджет (фільтр по даті scope) | весь рік | дати в Q | дати в M |
| Примітки | — | ✓ | ✓ |
| Ініціативи | — | ✓ | ✓ (active) |
| Процедури → задачі | — | — | ✓ |

Режим редагування: кнопка Pencil в хедері → розблокує додавання/видалення бюджету, редагування приміток, додавання/видалення ініціатив.

Кнопка Approve (панель внизу): показується тільки для canEdit коли статус `pending`.

---

## ProcedureDetailPanel — наборний по scope

| Секція | Рік | Квартал | Місяць |
|--------|:---:|:-------:|:------:|
| Опис + ціль (години/період) | ✓ | ✓ | ✓ |
| Послуга (serviceName) | ✓ | ✓ | ✓ |
| Компанії + метод розподілу | — | — | ✓ |
| Шаблони задач (title + content) | — | — | ✓ |
| Проєкти (зведені з місячних планів) | ✓ | ✓ | ✓ |
| Документи БЗ (зведені) | ✓ | ✓ | ✓ |
| Ініціативи | — | ✓ (всі) | ✓ (active) |
| Квартали → місяці (розгортаються) | ✓ | — | — |
| Місяці (план/факт/%) | — | ✓ | — |
| Футер (план/факт/%) | ✓ | ✓ | ✓ |

Порядок секцій: опис → послуга → компанії(M) → шаблони(M) → проєкти → документи → ініціативи(Q+M) → статистика(Y/Q) → футер

---

## MonthlyPlansListView (Місяць + нічого)

Процеси-аккордеони → процедури зі статусом + кнопки дій.
Показує `N/M` (планів/процедур) для кожного процесу.

---

## EmployeeTasksPanel (права панель)

| Вибір | Що показує при розгортанні |
|-------|---------------------------|
| Процесс (без процедури) | Процедури з годинами |
| Процедура | Задачі: назва + опис (2 рядки), source badge, години. Групування по назві + source |

---

## API Endpoints

| Endpoint | Methods | Опис |
|----------|---------|------|
| `/api/plans/annual` | POST, PATCH, DELETE | Річні плани: створити/копіювати, оновити, видалити |
| `/api/plans/quarterly` | POST, PATCH, DELETE | Квартальні плани: створити/копіювати, оновити, видалити |
| `/api/plans/monthly` | POST, DELETE | Місячні плани: створити/копіювати, видалити |
| `/api/plans/status` | PATCH | Універсальна зміна статусу (monthly/annual/quarterly) |
| `/api/plans/annual/budget` | POST, DELETE | Бюджетні статті річного плану |
| `/api/plans/quarterly/initiatives` | POST, PATCH, DELETE | Ініціативи квартального плану |

---

## Файли компонентів

```
src/components/dashboard/plans/v2/
├── PlansV2Content.tsx          — головний layout, 3 панелі, фільтри, маршрутизація
├── ProcessListPanel.tsx        — ліва панель (дерево процесів/процедур, аккордеон, іконки статусів)
├── ProcessDetailView.tsx       — середня: процесс (наборний Y/Q/M, edit mode)
├── ProcedureDetailPanel.tsx    — середня: процедура (наборний Y/Q/M) + ProcessView
├── AnnualViews.tsx             — AnnualListView + AnnualDetailView (legacy)
├── QuarterlyViews.tsx          — QuarterlyListView + QuarterlyDetailView (legacy)
├── MonthlyOverviewView.tsx     — MonthlyPlansListView + MonthlyCompaniesView + MonthlyUsersView
├── MonthlyProcessView.tsx      — (deprecated, замінений ProcessDetailView)
├── EmployeeTasksPanel.tsx      — права панель (співробітники + задачі)
└── demo-status-icons.html      — демо іконок статусів (public/)
```

Хуки:
```
src/hooks/
├── usePlansV2.ts               — навігація, дані, фільтри, бюджет, ініціативи, monthly overview
└── usePlansV2Detail.ts         — деталі: assignees, companies, projects, kbDocs, dailyTasks
```

API:
```
src/app/api/plans/
├── annual/route.ts             — POST/PATCH/DELETE річних планів
├── annual/budget/route.ts      — POST/DELETE бюджетних статей
├── quarterly/route.ts          — POST/PATCH/DELETE квартальних планів
├── quarterly/initiatives/route.ts — POST/PATCH/DELETE ініціатив
├── monthly/route.ts            — POST/DELETE місячних планів
├── status/route.ts             — PATCH статусу будь-якого плану
└── count/route.ts              — GET кількості планів
```

---

## Міграція БД (виконана 2026-03-26)

- `plan_status` enum: `pending`, `active`, `done` (замість 7 старих)
- `quarterly_plans.goal` → nullable
- `annual_plans.goal`, `expected_result` → nullable
- Views `v_annual_plans`, `v_plan_user_company_hours` перестворені
- Старі функції `get_plans_for_week`, `manage_annual_plan` видалені (V1)
