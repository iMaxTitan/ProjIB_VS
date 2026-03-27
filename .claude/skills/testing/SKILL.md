---
name: testing
description: "Правила написания тестов для проекта CS Platform. E2E тесты Playwright, паттерны, моки Supabase. Обязательно используй когда пользователь говорит 'напиши тест', 'добавь тесты', 'протестируй', 'e2e', 'playwright', или когда нужно проверить функциональность через автотесты."
---

# Testing — правила проекта CS Platform

## Стек тестирования

- **E2E:** Playwright (уже настроен)
- **Конфиг:** `playwright.config.ts`
- **Тесты:** `tests/e2e/` (по модулям: auth, dashboard, plans, reports, employees)
- **Авторизация:** `tests/setup/global-setup.ts` → сохраняет состояние в `tests/.auth/user.json`
- **Env:** `.env.test` (PLAYWRIGHT_BASE_URL, credentials)

## Структура тестов

```
tests/
├── setup/
│   └── global-setup.ts       # Логин через Azure AD, сохранение cookies
├── .auth/
│   └── user.json              # Сохранённое состояние авторизации
├── e2e/
│   ├── auth/
│   │   └── login.spec.ts      # Тесты аутентификации
│   ├── dashboard/
│   │   ├── navigation.spec.ts # Навигация по дашборду
│   │   └── tiles.spec.ts      # Плитки дашборда
│   ├── plans/
│   │   └── plans-crud.spec.ts # CRUD планов
│   ├── reports/
│   │   └── reports.spec.ts    # Отчёты
│   └── employees/
│       └── employees.spec.ts  # Сотрудники
```

## Команды запуска

```bash
npm run test:e2e              # Все тесты
npm run test:e2e:headed       # С видимым браузером
npm run test:e2e:ui           # Playwright UI mode
npm run test:e2e:debug        # Дебаг режим
npm run test:e2e:report       # Открыть HTML отчёт
npm run test:e2e:codegen      # Генерация тестов через запись
```

## Паттерн написания E2E теста

```typescript
import { test, expect } from '@playwright/test';

test.describe('Название модуля', () => {
  // Тесты по умолчанию используют storageState из конфига (авторизованный)
  // Для неавторизованных тестов:
  // test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/целевая-страница');
  });

  test('описание сценария', async ({ page }) => {
    // Arrange — подготовка
    const element = page.getByRole('button', { name: 'Создать план' });

    // Act — действие
    await element.click();

    // Assert — проверка
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
```

## Правила

### 1. Селекторы — ТОЛЬКО семантические
```typescript
// ✅ Правильно
page.getByRole('button', { name: 'Зберегти' })
page.getByRole('tab', { name: 'Підприємства' })
page.getByLabel('Назва процедури')
page.getByTestId('kpi-gauge')
page.getByText('Немає даних')

// ❌ Неправильно
page.locator('.btn-primary')
page.locator('#submit-button')
page.locator('div > span.text-sm')
```

### 2. Ожидания — ВСЕГДА явные
```typescript
// ✅ Правильно
await expect(page.getByRole('table')).toBeVisible();
await page.waitForResponse(resp =>
  resp.url().includes('/api/plans') && resp.status() === 200
);

// ❌ Неправильно
await page.waitForTimeout(3000);
```

### 3. Авторизация — через storageState
```typescript
// Авторизованные тесты — ничего не делать, storageState из конфига

// Неавторизованные тесты — явно указать:
test.use({ storageState: { cookies: [], origins: [] } });
```

### 4. API моки — для изоляции
```typescript
test('показывает пустое состояние когда нет планов', async ({ page }) => {
  // Мокаем ответ API
  await page.route('**/api/plans/count*', route =>
    route.fulfill({ json: { annual: 0, quarterly: 0, monthly: 0 } })
  );

  await page.goto('/dashboard');
  await expect(page.getByText('Немає планів')).toBeVisible();
});
```

### 5. Проекты — desktop + mobile
```typescript
// Конфиг уже включает 2 проекта:
// - chromium-desktop (1280x720)
// - chromium-mobile (Pixel 5)
// Тесты автоматически прогоняются на обоих
// Для mobile-only тестов:
test('мобильное меню открывается свайпом', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile only');
  // ...
});
```

### 6. Именование файлов
```
tests/e2e/{модуль}/{функция}.spec.ts
```

Примеры:
- `tests/e2e/plans/plans-crud.spec.ts`
- `tests/e2e/kpi/kpi-dashboard.spec.ts`
- `tests/e2e/references/procedures.spec.ts`

### 7. Данные — не мутировать продакшн
```typescript
// ✅ Создать → проверить → удалить
test('создание и удаление плана', async ({ page }) => {
  // Создаём тестовый план
  await page.getByRole('button', { name: 'Створити' }).click();
  // ... заполняем форму ...

  // Проверяем
  await expect(page.getByText('Тестовий план')).toBeVisible();

  // Удаляем (cleanup)
  await page.getByRole('button', { name: 'Видалити' }).click();
  await page.getByRole('button', { name: 'Підтвердити' }).click();
});
```

## Что тестировать

| Приоритет | Область | Что проверять |
|-----------|---------|---------------|
| Высокий | Auth | Редирект неавторизованного, логин, logout |
| Высокий | Планы | CRUD всех уровней (annual → quarterly → monthly → tasks) |
| Высокий | KPI | Расчёт отображается, gauge корректный |
| Средний | Отчёты | Таблица, PDF генерация, фильтры |
| Средний | Справочники | CRUD процедур, проектов, компаний |
| Низкий | Presence | Онлайн-статус обновляется |

## Чеклист перед написанием теста

- [ ] Файл в правильной директории `tests/e2e/{модуль}/`
- [ ] Используются семантические селекторы (getByRole, getByLabel, getByTestId)
- [ ] Нет `waitForTimeout` — только явные ожидания
- [ ] Тест идемпотентен — можно запустить повторно
- [ ] Cleanup если создаются данные
- [ ] Работает на обоих проектах (desktop + mobile) или явный skip
