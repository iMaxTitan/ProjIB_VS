# Модуль "Проекти"

> Дата створення: 2026-02-06

## Призначення

Модуль "Проекти" дозволяє тегувати задачі зовнішніми проектами/замовленнями для групування та звітності.

**Проект** - це робота за зовнішнім замовленням, яка може охоплювати декілька департаментів.

## Архітектура

### База даних

```
projects                        -- Довідник проектів
    project_id (PK)
    project_name
    description
    is_active (default true)
    created_by (FK user_profiles)
    created_at
    updated_at

project_departments             -- M:N зв'язок з департаментами
    project_id (FK)
    department_id (FK)
    PRIMARY KEY (project_id, department_id)

daily_tasks
    project_id (FK, optional)   -- Опціональна прив'язка задачі до проекту
```

### View

`v_projects_with_departments` - агрегує дані з department_ids та department_names масивами.

## Компоненти

### UI Компоненти

| Компонент | Файл | Опис |
|-----------|------|------|
| ProjectsReferenceContent | `ReferencesContent.tsx` | Two-panel layout для CRUD проектів |
| Project Form | Inline в правій панелі | Форма створення/редагування |
| Project Dropdown | `AddTaskModal.tsx` | Вибір проекту при створенні задачі |

### Хуки

| Хук | Файл | Опис |
|-----|------|------|
| `useProjects` | `src/hooks/useProjects.ts` | CRUD операції з проектами |
| `useProjectsForTask` | `src/hooks/useProjects.ts` | Отримання проектів для dropdown (фільтр по департаменту) |

### Типи

```typescript
// src/types/projects.ts

interface Project {
  project_id: string;
  project_name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface ProjectWithDepartments extends Project {
  department_ids: string[];
  department_names: string[];
}

interface ProjectOption {
  project_id: string;
  project_name: string;
  description: string | null;
}
```

## Логіка доступу

### Перегляд
- Всі авторизовані користувачі можуть переглядати проекти

### Управління (CRUD)
- Тільки `chief` та `head` можуть створювати/редагувати проекти
- Перевірка ролі на рівні UI

### Фільтрація для задач
- В AddTaskModal відображаються тільки активні проекти
- Фільтрація по департаменту користувача (M:N зв'язок)

## Використання

### Створення проекту

1. Перейти до **Справочники** → **Проекти**
2. Натиснути "Додати"
3. Заповнити форму в правій панелі:
   - Назва (обов'язково)
   - Опис (опціонально)
   - Вибрати департаменти (checkbox list)
   - Активний (checkbox)
4. Натиснути "Створити"

### Прив'язка задачі до проекту

1. При створенні/редагуванні задачі в AddTaskModal
2. Вибрати проект з dropdown "Проект (опціонально)"
3. Зберегти задачу

### Фільтрація задач по проекту

> TODO: Реалізувати фільтрацію в звітах

## RLS Policies

```sql
-- Всі можуть читати
CREATE POLICY "Projects viewable by all authenticated" ON projects
  FOR SELECT TO authenticated USING (true);

-- Всі можуть редагувати (перевірка ролей на UI)
CREATE POLICY "Projects full access" ON projects
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);
```

**Примітка:** RLS policies спрощені тому що `auth.uid()` не працює з Azure AD авторизацією.

## Міграції

| Файл | Опис |
|------|------|
| `20260206_add_projects.sql` | Основна міграція - таблиці, view, trigger, RLS |
| `20260206_fix_projects_rls.sql` | Фікс RLS для Azure AD |

## Типові помилки

### Помилка створення проекту (пустий об'єкт {})

**Причина:** RLS policy блокує INSERT
**Рішення:** Виконати `20260206_fix_projects_rls.sql`

### Dropdown проектів не відображається

**Причина:**
1. Не передано `userDepartmentId` в AddTaskModal
2. Немає активних проектів для департаменту користувача

**Рішення:**
1. Переконатись що `userDepartmentId={user.department_id}` передається
2. Створити проект з прив'язкою до потрібного департаменту

## Майбутні покращення

- [ ] Фільтрація задач по проекту в WorkLogViewer
- [ ] Звітність по проектах
- [ ] Статистика годин по проектах
- [ ] Архівування проектів (soft delete)
