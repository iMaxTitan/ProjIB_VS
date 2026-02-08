# Claude AI Instructions - ReportIB Project

## 🎨 UI Design System Rules

При работе с этим проектом **ОБЯЗАТЕЛЬНО** следуй системе дизайна.

### Быстрый чеклист для КАЖДОГО UI компонента:

```tsx
// ✅ Минимальный правильный компонент:
<button
  onClick={handler}
  aria-label="Описание действия"
  className="
    px-3 sm:px-4              // responsive отступы
    py-2 sm:py-2.5            // responsive отступы
    text-sm sm:text-base       // responsive размер текста
    bg-indigo-600             // цвет из токенов
    rounded-lg                // стандартное скругление
    transition-[transform,background-color]  // оптимизированные transitions
    duration-base             // токен длительности
    focus:outline-none        // убираем outline
    focus:ring-2              // добавляем ring
    focus:ring-indigo-500     // цвет ring
    focus:ring-offset-2       // отступ ring
    hover:bg-indigo-700       // hover эффект
    active:scale-95           // эффект нажатия
    disabled:opacity-50       // состояние disabled
    disabled:cursor-not-allowed
  "
>
  <Icon aria-hidden="true" className="h-4 w-4" />
  <span className="hidden xs:inline">Полный текст</span>
  <span className="xs:hidden">Короткий</span>
</button>
```

## 🚀 Быстрые правила

### 1. Цвета - ТОЛЬКО из токенов
```tsx
✅ bg-indigo-600, text-white, border-gray-300
❌ bg-[#4f46e5], text-[#ffffff]
```

### 2. Responsive - ВСЕГДА
```tsx
✅ px-3 sm:px-4 md:px-6
✅ text-xs sm:text-sm md:text-base
✅ hidden xs:inline
❌ px-4 (без адаптации)
```

### 3. Accessibility - БЕЗ ИСКЛЮЧЕНИЙ
```tsx
✅ aria-label="Создать план"
✅ aria-hidden="true" (для иконок)
✅ focus:ring-2 focus:ring-indigo-500
✅ role="button" tabIndex={0} (для div-кнопок)
❌ <button onClick={...}><Icon /></button>
```

### 4. Компоненты - используй готовые
```tsx
✅ import { Button } from '@/components/ui/Button'
✅ import { Modal } from '@/components/ui/Modal'
❌ <button className="...много кода...">
```

### 5. Градиенты - используй классы
```tsx
✅ className="gradient-primary"
✅ className="gradient-glass"
❌ style={{ background: 'linear-gradient(...)' }}
```

### 6. Анимации - оптимизируй
```tsx
✅ transition-[transform,opacity] duration-base
✅ animate-fade-in
✅ active:scale-95
❌ transition-all
```

## 📦 Готовые компоненты

### Button
```tsx
import { Button } from '@/components/ui/Button';

<Button variant="default" size="md">Кнопка</Button>
<Button variant="destructive">Удалить</Button>
<Button variant="success">Сохранить</Button>

// Размеры: xs, sm, md, lg, xl
// Варианты: default, destructive, outline, secondary, ghost, link, success, warning
```

### Modal (с focus trap!)
```tsx
import { Modal } from '@/components/ui/Modal';

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Заголовок"
>
  {/* Контент */}
</Modal>
```

## 🎨 Готовые утилиты в globals.css

```tsx
// Градиенты
className="gradient-primary"        // основной фиолетово-синий
className="gradient-glass"          // стеклянный эффект
className="gradient-card"           // тонкий для карточек

// Стеклянные эффекты
className="glass-effect"            // bg-white/30 backdrop-blur-sm
className="glass-effect-strong"    // bg-white/20 backdrop-blur-md

// Focus states
className="focus-ring"              // стандартный focus ring
className="focus-ring-error"        // красный focus ring

// Эффекты
className="animate-press"           // active:scale-95
className="card-base"               // базовая карточка
className="card-hover"              // hover для карточки
```

## 📏 Spacing tokens

```tsx
// Используй эти классы для отступов:
px-xs   // 4px
px-sm   // 8px
px-md   // 16px
px-lg   // 24px
px-xl   // 32px
px-2xl  // 48px
px-3xl  // 64px

// Или стандартные Tailwind:
px-2, px-4, px-6, px-8, etc.
```

## 🎯 Типичные задачи

### Создание карточки
```tsx
<div className="
  bg-white rounded-xl
  shadow-card hover:shadow-card-hover
  border border-gray-100
  p-4 sm:p-6
  transition-shadow duration-base
">
  <h3 className="text-base sm:text-lg font-semibold mb-2 sm:mb-3">
    Заголовок
  </h3>
  <p className="text-sm sm:text-base text-gray-600">
    Контент карточки
  </p>
</div>
```

### Создание кнопки с иконкой
```tsx
<Button
  onClick={handleClick}
  aria-label="Создать новый план"
  className="gap-2"
>
  <Plus aria-hidden="true" className="h-4 w-4" />
  <span className="hidden xs:inline">Создать план</span>
  <span className="xs:hidden">Создать</span>
</Button>
```

### Создание навигационного элемента
```tsx
<button
  onClick={() => navigate(path)}
  aria-label={`Перейти к разделу: ${label}`}
  aria-current={isActive ? 'page' : undefined}
  className={cn(
    "flex items-center gap-2 px-3 sm:px-4 py-2",
    "text-sm font-medium rounded-lg",
    "transition-[transform,background-color] duration-base",
    "focus-ring active:scale-95",
    isActive
      ? "bg-indigo-50 text-indigo-700"
      : "text-gray-600 hover:bg-gray-50"
  )}
>
  <Icon aria-hidden="true" className="h-4 w-4" />
  <span>{label}</span>
</button>
```

### Создание интерактивного div (как кнопка)
```tsx
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
  className="
    cursor-pointer
    focus:outline-none focus:ring-2 focus:ring-indigo-500
    hover:bg-gray-50
    transition-colors duration-base
  "
>
  Контент
</div>
```

## 🚫 ЧТО НЕЛЬЗЯ ДЕЛАТЬ

1. ❌ Создавать UI без responsive классов
2. ❌ Забывать aria-label на интерактивных элементах
3. ❌ Использовать transition-all
4. ❌ Использовать произвольные цвета bg-[#...]
5. ❌ Забывать про focus states
6. ❌ Создавать новые модальные окна (используй Modal)
7. ❌ Создавать кнопки вручную (используй Button)
8. ❌ Забывать aria-hidden="true" на декоративных иконках

## 📚 Полная документация

Детальная документация: `docs/UI_DESIGN_SYSTEM.md`

## 🔄 При изменении существующего компонента

Если видишь код без этих паттернов - ОБЯЗАТЕЛЬНО улучши его:

```tsx
// ❌ Старый код
<button onClick={handleClick} className="px-4 py-2 bg-blue-500">
  <Plus />
</button>

// ✅ Улучшенный код
<Button
  onClick={handleClick}
  aria-label="Добавить элемент"
  className="gap-2"
>
  <Plus aria-hidden="true" className="h-4 w-4" />
  <span className="hidden xs:inline">Добавить</span>
</Button>
```

---

**КРИТИЧЕСКИ ВАЖНО:** Эти правила НЕ опциональны. Следуй им при КАЖДОМ изменении UI.
