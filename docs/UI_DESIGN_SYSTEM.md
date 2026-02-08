# UI Design System - Руководство

## Обзор

Этот документ описывает систему дизайна проекта ReportIB, включая design tokens, компоненты, accessibility guidelines и best practices.

## 🎨 Design Tokens

### Расположение
Все design tokens находятся в файле [src/styles/design-tokens.ts](../src/styles/design-tokens.ts)

### Основные категории

#### 1. Цвета (Colors)
```typescript
import { colors, getColor } from '@/styles/design-tokens';

// Использование:
const primaryColor = colors.primary[600]; // #0284c7
const textColor = getColor('secondary', 700);
```

**Палитра:**
- `primary` - основной синий цвет (50-900)
- `secondary` - серые оттенки (50-900)
- `indigo` - индиго/фиолетовый (50-900)
- `success` - зелёный для успешных состояний
- `warning` - жёлтый для предупреждений
- `error` - красный для ошибок

#### 2. Spacing (Отступы)
```typescript
import { spacing, getSpacing } from '@/styles/design-tokens';

// Использование в Tailwind:
className="px-md py-sm gap-lg"

// В JavaScript:
const padding = getSpacing('md'); // '1rem'
```

**Шкала:**
- `xs` - 4px (0.25rem)
- `sm` - 8px (0.5rem)
- `md` - 16px (1rem)
- `lg` - 24px (1.5rem)
- `xl` - 32px (2rem)
- `2xl` - 48px (3rem)
- `3xl` - 64px (4rem)

#### 3. Размеры компонентов (Sizes)
```typescript
import { sizes } from '@/styles/design-tokens';

// Кнопки:
sizes.button.sm  // { px: '0.75rem', py: '0.5rem', text: '0.875rem' }
sizes.button.md  // { px: '1rem', py: '0.625rem', text: '0.875rem' }
sizes.button.lg  // { px: '1.5rem', py: '0.75rem', text: '1rem' }

// Карточки:
sizes.card.padding.md  // '1rem'
sizes.card.gap.sm      // '0.5rem'

// Модальные окна:
sizes.modal.maxWidth.lg  // '42rem'
```

#### 4. Типографика
```typescript
import { typography } from '@/styles/design-tokens';

// Размеры шрифта с line-height:
typography.fontSize.sm     // { size: '0.875rem', lineHeight: '1.25rem' }
typography.fontSize.base   // { size: '1rem', lineHeight: '1.5rem' }
typography.fontSize.lg     // { size: '1.125rem', lineHeight: '1.75rem' }

// Вес шрифта:
typography.fontWeight.medium    // '500'
typography.fontWeight.semibold  // '600'
typography.fontWeight.bold      // '700'
```

#### 5. Тени (Shadows)
```typescript
import { shadows, getShadow } from '@/styles/design-tokens';

// Использование в Tailwind:
className="shadow-card hover:shadow-card-hover"

// В JavaScript:
const shadow = getShadow('card');
```

#### 6. Градиенты (Gradients)
```typescript
import { gradients, getGradient } from '@/styles/design-tokens';

// Использование в CSS классах:
className="gradient-primary"
className="gradient-glass"

// В inline styles:
style={{ background: getGradient('primary') }}
```

**Доступные градиенты:**
- `gradient-primary` - основной фиолетово-синий
- `gradient-primary-subtle` - мягкий градиент
- `gradient-indigo` - индиго градиент
- `gradient-blue` - синий градиент
- `gradient-success` - зелёный
- `gradient-warning` - жёлтый
- `gradient-error` - красный
- `gradient-glass` - стеклянный эффект
- `gradient-card` - тонкий для карточек

## 📱 Responsive Design

### Breakpoints
```typescript
// В Tailwind:
className="px-2 sm:px-4 md:px-6 lg:px-8"

// В JavaScript:
import { breakpoints } from '@/styles/design-tokens';
const mobile = breakpoints.xs;  // '480px'
```

**Шкала:**
- `xs` - 480px (маленькие телефоны)
- `sm` - 640px (телефоны)
- `md` - 768px (планшеты)
- `lg` - 1024px (ноутбуки)
- `xl` - 1280px (десктопы)
- `2xl` - 1536px (большие экраны)

### Best Practices
```tsx
// ✅ Хорошо - адаптивные размеры
<button className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm">

// ✅ Хорошо - скрытие текста на мобильных
<span className="hidden xs:inline">Полный текст</span>
<span className="xs:hidden">Короткий</span>

// ❌ Плохо - фиксированные размеры
<button className="px-4 py-2 text-sm">
```

## ♿ Accessibility (A11y)

### Общие принципы
1. **Все интерактивные элементы** должны иметь `aria-label` или понятный текст
2. **Focus states** - видимые для клавиатурной навигации
3. **Keyboard navigation** - Tab, Enter, Space, ESC
4. **Semantic HTML** - используйте правильные теги

### Примеры

#### Кнопки
```tsx
// ✅ Хорошо
<button
  onClick={handleClick}
  aria-label="Создать новый план"
  className="focus:outline-none focus:ring-2 focus:ring-indigo-500"
>
  <Plus aria-hidden="true" />
</button>

// ❌ Плохо
<button onClick={handleClick}>
  <Plus />
</button>
```

#### Навигация
```tsx
// ✅ Хорошо
<nav role="navigation" aria-label="Основная навигация">
  <button
    aria-label="Перейти к разделу: Планы"
    aria-current={isActive ? 'page' : undefined}
    className="focus-ring"
  >
    <Calendar aria-hidden="true" />
    <span>Планы</span>
  </button>
</nav>
```

#### Модальные окна
```tsx
// ✅ Хорошо - наш Modal компонент
<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="Заголовок"
>
  {/* Автоматически:
    - Focus trap
    - ESC для закрытия
    - Блокировка scroll
    - aria-modal, role="dialog"
  */}
</Modal>
```

#### Интерактивные элементы не-кнопки
```tsx
// ✅ Хорошо
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
  aria-label="Описание действия"
  className="focus:outline-none focus:ring-2"
>
  Контент
</div>
```

### Утилиты для accessibility

#### Focus Ring
```tsx
// Используйте готовые классы:
className="focus-ring"          // Основной focus ring
className="focus-ring-error"    // Красный для ошибок

// Или напрямую:
className="focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
```

#### Скрытие от screen readers
```tsx
// Декоративные иконки
<Icon aria-hidden="true" />

// Визуально скрытый текст (для screen readers)
<span className="sr-only">Текст для screen readers</span>
```

## 🎯 Компоненты

### Button
[src/components/ui/Button.tsx](../src/components/ui/Button.tsx)

```tsx
import { Button } from '@/components/ui/Button';

// Варианты:
<Button variant="default">Кнопка</Button>
<Button variant="destructive">Удалить</Button>
<Button variant="outline">Отмена</Button>
<Button variant="success">Сохранить</Button>

// Размеры:
<Button size="xs">Очень маленькая</Button>
<Button size="sm">Маленькая</Button>
<Button size="md">Средняя (по умолчанию)</Button>
<Button size="lg">Большая</Button>
<Button size="xl">Очень большая</Button>
```

### Modal
[src/components/ui/Modal.tsx](../src/components/ui/Modal.tsx)

```tsx
import { Modal } from '@/components/ui/Modal';

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Заголовок модального окна"
  maxWidth="max-w-lg"  // по умолчанию max-w-2xl
>
  <p>Содержимое модального окна</p>
  <ModalFooter
    onCancel={() => setIsOpen(false)}
    loading={isLoading}
    isEditMode={false}
  />
</Modal>
```

**Возможности:**
- ✅ Focus trap (фокус внутри модального окна)
- ✅ ESC для закрытия
- ✅ Клик вне области для закрытия
- ✅ Блокировка scroll body
- ✅ Восстановление фокуса при закрытии
- ✅ Полная accessibility

## 🔧 Tailwind Configuration

### Настроенные утилиты

#### Анимации
```tsx
className="animate-fade-in"    // Плавное появление
className="animate-slide-in"   // Слайд снизу
className="animate-scale-in"   // Масштабирование
className="animate-press"      // Эффект нажатия
```

#### Длительность переходов
```tsx
className="duration-fast"    // 150ms
className="duration-base"    // 200ms
className="duration-slow"    // 300ms
className="duration-slower"  // 500ms
```

#### Z-index
```tsx
className="z-dropdown"        // 1000
className="z-modal-backdrop"  // 1040
className="z-modal"           // 1050
```

#### Тени
```tsx
className="shadow-card"        // Тень для карточек
className="shadow-card-hover"  // При hover
className="shadow-focus"       // Focus ring тень
```

## 📝 Best Practices

### 1. Консистентность
```tsx
// ✅ Используйте design tokens
className="px-md py-sm gap-lg"

// ❌ Избегайте произвольных значений
className="px-[13px] py-[7px] gap-[19px]"
```

### 2. Композиция классов
```tsx
// ✅ Используйте cn() utility для условных классов
import { cn } from '@/lib/utils';

className={cn(
  "base-classes",
  isActive && "active-classes",
  isDisabled && "disabled-classes"
)}

// ❌ Не склеивайте строки
className={`base-classes ${isActive ? 'active-classes' : ''}`}
```

### 3. Переиспользование стилей
```tsx
// ✅ Создавайте утилиты в globals.css
.card-base {
  @apply bg-white rounded-xl shadow-card border border-gray-100;
}

// Использование:
className="card-base card-hover"
```

### 4. Анимации производительности
```tsx
// ✅ Анимируйте только transform и opacity
className="transition-[transform,opacity] duration-base"

// ❌ Избегайте transition-all
className="transition-all"
```

### 5. Accessibility first
```tsx
// ✅ Всегда добавляйте aria-labels
<button
  onClick={handleDelete}
  aria-label="Удалить элемент"
  className="focus-ring"
>
  <Trash aria-hidden="true" />
</button>

// ❌ Кнопка без контекста
<button onClick={handleDelete}>
  <Trash />
</button>
```

## 🚀 Миграция существующих компонентов

### Чеклист для обновления компонента:
1. [ ] Заменить хардкодные размеры на spacing токены
2. [ ] Добавить responsive классы (xs, sm, md, lg)
3. [ ] Использовать градиенты из globals.css
4. [ ] Добавить aria-labels для всех интерактивных элементов
5. [ ] Обеспечить keyboard navigation
6. [ ] Добавить focus states
7. [ ] Заменить transition-all на конкретные свойства
8. [ ] Использовать duration токены

### Пример миграции:
```tsx
// До:
<button
  onClick={handleClick}
  className="px-4 py-2 bg-blue-500 text-white rounded transition-all"
>
  Кнопка
</button>

// После:
<button
  onClick={handleClick}
  aria-label="Выполнить действие"
  className="px-md py-sm bg-indigo-600 text-white rounded-lg transition-[transform,opacity] duration-base focus-ring active:scale-95"
>
  Кнопка
</button>
```

## 📚 Дополнительные ресурсы

- [Tailwind CSS Documentation](https://tailwindcss.com)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

## 🎯 TODO

### Средний приоритет
- [ ] Создать Storybook для компонентов
- [ ] Добавить skeleton loaders
- [ ] Заменить все модальные окна на улучшенный Modal
- [ ] Подключить custom fonts (Inter, Manrope)

### Низкий приоритет
- [ ] Dark mode полная поддержка
- [ ] Создать UI Kit страницу с примерами
- [ ] Добавить toast notifications
- [ ] Анимации для списков (framer-motion)
