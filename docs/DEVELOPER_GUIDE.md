# Руководство разработчика ReportIB

> Последнее обновление: 2026-02-11

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
- Миграция: `supabase/migrations/20260209_remove_legacy_weekly_planning.sql`.
- Не использовать и не возвращать weekly-таблицы/представления/функции.

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





