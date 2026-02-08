# UI Design System - Шпаргалка

## 🎯 Базовый шаблон компонента

```tsx
<Component
  // Accessibility
  aria-label="Описание действия"
  role="button"           // если не кнопка
  tabIndex={0}            // если не кнопка

  // Responsive классы
  className="
    px-3 sm:px-4 md:px-6
    py-2 sm:py-2.5 md:py-3
    text-xs sm:text-sm md:text-base

    // Цвета из токенов
    bg-indigo-600 hover:bg-indigo-700
    text-white
    border border-gray-300
    rounded-lg

    // Оптимизированные transitions
    transition-[transform,background-color]
    duration-base

    // Focus states
    focus:outline-none
    focus:ring-2
    focus:ring-indigo-500
    focus:ring-offset-2

    // Эффекты
    hover:shadow-md
    active:scale-95

    // Состояния
    disabled:opacity-50
    disabled:cursor-not-allowed
  "
>
  {/* Иконки ВСЕГДА с aria-hidden */}
  <Icon aria-hidden="true" className="h-4 w-4" />

  {/* Адаптивный текст */}
  <span className="hidden xs:inline">Полный текст</span>
  <span className="xs:hidden">Короткий</span>
</Component>
```

## 🎨 Цвета

```tsx
// Основные
bg-indigo-600, bg-indigo-700    // Основной цвет
bg-blue-500, bg-blue-600        // Синий
bg-gray-100, bg-gray-200        // Серый фон
text-gray-600, text-gray-700    // Серый текст

// Состояния
bg-success-500                  // Зеленый (успех)
bg-warning-500                  // Желтый (предупреждение)
bg-error-500                    // Красный (ошибка)

// ❌ НЕ ИСПОЛЬЗУЙ
bg-[#4f46e5]                    // Произвольные цвета
```

## 📱 Responsive

```tsx
// Breakpoints: xs(480) sm(640) md(768) lg(1024) xl(1280) 2xl(1536)

// Отступы
px-2 sm:px-4 md:px-6 lg:px-8

// Размер текста
text-xs sm:text-sm md:text-base lg:text-lg

// Скрытие/показ
hidden xs:inline                 // Скрыто на очень маленьких
xs:hidden                        // Показано только на маленьких
hidden sm:block                  // Скрыто на мобильных
```

## ♿ Accessibility

```tsx
// Кнопки
<button
  aria-label="Создать план"
  className="focus-ring"
/>

// Div-кнопки
<div
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handler();
    }
  }}
  aria-label="Действие"
/>

// Иконки
<Icon aria-hidden="true" />

// Навигация
<nav role="navigation" aria-label="Основная навигация">
  <button aria-current={isActive ? 'page' : undefined}>

// Модальные окна - используй готовый Modal (focus trap встроен)
```

## 🎭 Анимации

```tsx
// ✅ ПРАВИЛЬНО - конкретные свойства
transition-[transform,opacity] duration-base
transition-transform duration-fast
transition-colors duration-base

// Готовые анимации
animate-fade-in
animate-scale-in
active:scale-95

// ❌ НЕПРАВИЛЬНО
transition-all
```

## 🎨 Градиенты

```tsx
// Используй готовые классы
className="gradient-primary"        // Основной
className="gradient-glass"          // Стеклянный
className="gradient-card"           // Для карточек

// Или через токены
import { getGradient } from '@/styles/design-tokens';
style={{ background: getGradient('primary') }}
```

## 📦 Компоненты

### Button
```tsx
import { Button } from '@/components/ui/Button';

<Button variant="default" size="md">Текст</Button>

// Варианты: default, destructive, outline, secondary,
//           ghost, link, success, warning
// Размеры: xs, sm, md, lg, xl, icon
```

### Modal
```tsx
import { Modal } from '@/components/ui/Modal';

<Modal isOpen={open} onClose={close} title="Заголовок">
  {/* Контент */}
</Modal>
```

## 🎯 Готовые утилиты

```tsx
// Focus
className="focus-ring"              // Стандартный
className="focus-ring-error"        // Красный

// Карточки
className="card-base"               // Базовая карточка
className="card-hover"              // С hover эффектом

// Эффекты
className="glass-effect"            // Стеклянный
className="animate-press"           // Эффект нажатия
```

## 📏 Spacing

```tsx
// Отступы
gap-xs   // 4px      gap-1   // 4px
gap-sm   // 8px      gap-2   // 8px
gap-md   // 16px     gap-4   // 16px
gap-lg   // 24px     gap-6   // 24px
gap-xl   // 32px     gap-8   // 32px
gap-2xl  // 48px     gap-12  // 48px
gap-3xl  // 64px     gap-16  // 64px
```

## 🎨 Тени

```tsx
shadow-card              // Для карточек
shadow-card-hover        // При hover
shadow-focus             // Focus ring тень
```

## 🔢 Z-Index

```tsx
z-dropdown        // 1000
z-sticky          // 1020
z-fixed           // 1030
z-modal-backdrop  // 1040
z-modal           // 1050
z-popover         // 1060
z-tooltip         // 1070
```

## ⏱️ Длительности

```tsx
duration-fast     // 150ms
duration-base     // 200ms
duration-slow     // 300ms
duration-slower   // 500ms
```

## 🚫 Запрещено

```tsx
❌ bg-[#4f46e5]                    // Произвольные цвета
❌ px-[13px]                       // Произвольные отступы
❌ transition-all                  // Медленно
❌ z-[9999]                        // Произвольный z-index
❌ <button><Icon /></button>       // Без aria-label
❌ без responsive классов          // Только desktop
❌ без focus states                // Плохая accessibility
```

## ✅ Типичные паттерны

### Карточка
```tsx
<div className="card-base card-hover p-4 sm:p-6">
  <h3 className="text-base sm:text-lg font-semibold mb-2">Заголовок</h3>
  <p className="text-sm text-gray-600">Контент</p>
</div>
```

### Кнопка действия
```tsx
<Button
  onClick={handler}
  aria-label="Создать план"
  className="gap-2"
>
  <Plus aria-hidden="true" className="h-4 w-4" />
  <span className="hidden xs:inline">Создать</span>
</Button>
```

### Навигация
```tsx
<button
  aria-label="Планы"
  aria-current={isActive ? 'page' : undefined}
  className={cn(
    "flex items-center gap-2 px-4 py-2 rounded-lg",
    "transition-colors duration-base focus-ring",
    isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-gray-50"
  )}
>
  <Calendar aria-hidden="true" className="h-4 w-4" />
  Планы
</button>
```

---

**Всегда:** responsive + accessibility + design tokens + оптимизированные анимации
