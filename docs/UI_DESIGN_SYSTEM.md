# UI дизайн-система

> Последнее обновление: 2026-03-03

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

Shared-компоненты для дашборда/справочников (`src/components/dashboard/shared/`):

- `TwoPanelLayout.tsx` — двухпанельный layout (список + детали)
- `DashboardTopTabs.tsx` — верхние табы секций
- `GroupHeader.tsx` — заголовок группы
- `GradientDetailCard.tsx` — карточка с градиентом
- `DetailSection.tsx` — секция деталей
- `ReferenceListItem.tsx` — элемент списка справочника
- `DashboardStatCard.tsx` — карточка статистики
- `FilterBar.tsx` — панель фильтров
- `ExpandableListItem.tsx` — раскрываемый элемент
- `MobileDetailsFab.tsx` — FAB для мобильной версии

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

## 7. Loading и Error states

### Loading

- Полноэкранная загрузка: `<Spinner />` из `@/components/ui/Spinner` (размеры: sm, md, lg)
- Inline загрузка (кнопки, поля): иконка с `animate-spin`
- Списки: CSS-скелетоны (`animate-pulse`, серые блоки по форме контента)
- Данные из TanStack Query: проверять `isLoading` → показывать Spinner/скелетон

```tsx
// Стандартный паттерн
if (isLoading) return <div className="flex justify-center py-8"><Spinner /></div>;
if (error) return <div className="text-center py-8 text-red-500">{getErrorMessage(error)}</div>;
```

### Error

- Ошибки загрузки данных: текст `text-red-500` по центру контейнера
- Ошибки форм: красная рамка `border-red-500` + текст под полем `text-red-500 text-xs`
- Утилита: `getErrorMessage(error)` из `@/lib/shared/utils/error-message`

### Notifications (Toast)

- Библиотека: `sonner` (Toaster подключён в `app/layout.tsx`)
- Успех: `toast.success('Сохранено')`
- Ошибка: `toast.error('Ошибка: ...')`
- Позиция: top-right (по умолчанию)
- Не использовать для критичных ошибок (только toast + inline error)

## 8. Связанные документы

- `docs/TWO_PANEL_TAB_STANDARD.md`
- `docs/DEVELOPER_GUIDE.md`





