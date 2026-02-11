# Стандарт двухпанельного интерфейса

> Последнее обновление: 2026-02-11

## 1. Основной компонент

Использовать:

```tsx
import { TwoPanelLayout } from '@/components/dashboard/content/shared';
```

Источник:

- `src/components/dashboard/content/shared/TwoPanelLayout.tsx`

## 2. Обязательный паттерн

- левая панель: список/фильтры/навигация
- правая панель: детали/форма/действия
- desktop: split-layout
- mobile: детали в `BottomDrawer`

## 3. Актуальные props `TwoPanelLayout`

- `leftPanel: ReactNode`
- `rightPanel: ReactNode`
- `resizable?: boolean` (по умолчанию `true`)
- `initialWidth?: number` (по умолчанию `480`)
- `minWidth?: number` (по умолчанию `280`)
- `maxWidth?: number` (по умолчанию `600`)
- `isDrawerOpen?: boolean`
- `onDrawerClose?: () => void`
- `containerClassName?: string`
- `leftPanelClassName?: string`
- `rightPanelClassName?: string`
- `resizerClassName?: string`
- `mobileDrawerContentClassName?: string`

## 4. Сопутствующие shared-компоненты

- `DashboardTopTabs`
- `GroupHeader`
- `GradientDetailCard`
- `DetailSection`
- `ReferenceListItem`
- `DashboardStatCard`
- `ExpandableListItem`

Экспорт:

- `src/components/dashboard/content/shared/index.ts`

## 5. Правила применения

1. Не реализовывать split-layout вручную для новых экранов.
2. Скролл держать на уровне содержимого панелей, а не на странице оболочки приложения.
3. На мобильных управлять деталями через состояние drawer (`isDrawerOpen`).
4. Тоны/цвета панелей держать консистентными с семантикой раздела.
5. Тяжелые формы и карточки редактирования размещать в правой панели.

## 6. Минимальный пример

```tsx
<TwoPanelLayout
  leftPanel={<ReferenceList />}
  rightPanel={<ReferenceDetails />}
  isDrawerOpen={isDrawerOpen}
  onDrawerClose={() => setDrawerOpen(false)}
  initialWidth={460}
  rightPanelClassName="bg-indigo-50/30"
/>
```





