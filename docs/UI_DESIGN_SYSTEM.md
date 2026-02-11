# UI дизайн-система

> Последнее обновление: 2026-02-11

## 1. Источник истины

Основные дизайн-константы определены в:

- `src/styles/design-system.ts`
- `src/styles/globals.css`

## 2. Токены и примитивы

### Цвета

- базовая палитра: `colors.primary`, `colors.gray`
- семантические статусы: `colors.status` (`success`, `warning`, `error`, `info`)
- KPI-статусы: `colors.kpi`

### Отступы

Шкала отступов в `spacing`:

- `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`

### Типографика

Типографические константы:

- `typography.fontFamily`
- `typography.fontSize`
- `typography.fontWeight`

### Тени и брейкпоинты

- `shadows`: `sm`, `base`, `md`, `lg`, `xl`
- `breakpoints`: `sm`, `md`, `lg`, `xl`, `2xl`

## 3. Базовые UI-компоненты

Переиспользуемые UI-элементы:

- `src/components/ui/Button.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/BottomDrawer.tsx`
- `src/components/ui/Spinner.tsx`

Shared-компоненты для дашборда/справочников:

- `src/components/dashboard/content/shared/TwoPanelLayout.tsx`
- `src/components/dashboard/content/shared/DashboardTopTabs.tsx`
- `src/components/dashboard/content/shared/GroupHeader.tsx`
- `src/components/dashboard/content/shared/GradientDetailCard.tsx`
- `src/components/dashboard/content/shared/DetailSection.tsx`
- `src/components/dashboard/content/shared/ReferenceListItem.tsx`
- `src/components/dashboard/content/shared/DashboardStatCard.tsx`

## 4. Конвенции компоновки

- дашборд работает в единой оболочке приложения на `/`
- для справочников/отчетов/планов применять двухпанельный паттерн, где это уместно
- на мобильных детализация открывается через `BottomDrawer`

## 5. Базовые требования доступности (A11y)

- интерактивные элементы должны иметь текст или корректный `aria-label`
- обязательна клавиатурная навигация (`Tab`, `Enter`, `Space`, `Escape`)
- focus-состояния должны быть видимыми
- декоративные иконки помечать `aria-hidden`

## 6. Правила стилизации

- использовать `cn(...)` для условной композиции классов
- не вводить случайные «одноразовые» размеры, если есть токен
- предпочитать явные transition-свойства вместо широкого `transition-all`
- сохранять семантическую консистентность тонов/цветов между разделами

## 7. Связанные документы

- `docs/TWO_PANEL_TAB_STANDARD.md`
- `docs/DEVELOPER_GUIDE.md`





