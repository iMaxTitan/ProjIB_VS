# Модуль проектов

> Последнее обновление: 2026-02-11

## 1. Назначение

Проекты — опциональные теги задач для внешних и внутренних инициатив.

Цели модуля:

- вести справочник проектов
- связывать проекты с департаментами (M:N)
- давать выбор проекта в форме задачи

## 2. Модель данных

- `projects`
- `project_departments`
- `daily_tasks.project_id` (опциональный FK)
- `v_projects_with_departments` (модель чтения)

См. также:

- `docs/database/SCHEMA.md`
- `docs/database/TABLES_USAGE.md`

## 3. Основной код

- hooks: `src/hooks/useProjects.ts`
  - `useProjects()`
  - `useProjectsForTask(userDepartmentId)`
- UI справочников:
  - `src/components/dashboard/content/references/ProjectsReferenceContent.tsx`
- интеграция в форму задач:
  - `src/components/dashboard/Tasks/AddTaskModal.tsx`

## 4. Функциональное поведение

1. CRUD проектов в разделе справочников
2. один проект может быть связан с несколькими департаментами
3. Выпадающий список в задаче показывает активные проекты, отфильтрованные по департаменту пользователя
4. `project_id` в задаче остается необязательным

## 5. Модель доступа

- чтение: авторизованные пользователи
- создание/изменение/удаление: ограничение в UI по ролям (`chief`, `head`)
- доступ на стороне БД подчиняется текущей RLS и миграциям

## 6. Миграции

- `supabase/migrations/20260206_add_projects.sql`
- `supabase/migrations/20260206_fix_projects_rls.sql`



