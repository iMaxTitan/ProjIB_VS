# Планувальник — переписати UI по demo-design3.html

> Дата: 2026-03-18
> Статус: TODO
> Контекст: Phase 4 модуля Планувальник скопіювала старий код Cabinet замість того щоб написати по дизайну

## Проблема

Компоненти `components/dashboard/planner/` — це копія старого Cabinet з переіменованими файлами. Вони використовують inline стилі і не відповідають дизайн-системі demo-design3.html.

## Що робити

Переписати 8 компонентів **З НУЛЯ** по demo-design3.html. НЕ копіювати старий код — читати дизайн і писати новий.

### Еталон

Відкрити `public/demo-design3.html` → вкладка "Кабінет" (тепер = Планувальник). Це 100% source of truth.

### Ієрархія дизайну (з demo-design3)

```
L0  body           — gradient background
L1  .glass-panel   — zone (sidebar, filter, stats, grid panel, tasks panel)
L2  .element-card  — element inside zone (.plan-item, .proc-item, .cal-table)
L3  .data-cell     — item inside element (.cal-block, .task-row, .draft-row)
```

### Layout (з demo-design3, рядки 631-655)

```html
<!-- Два стовпці -->
<div class="flex gap-2" style="height: calc(100vh - 110px);">
  <!-- LEFT: w-420px, flex-col, gap-2 -->
  <div class="w-[420px] flex-shrink-0 flex flex-col gap-2">
    <!-- [glass-panel] Фільтри: year/month nav + week nav -->
    <!-- [glass-panel] Процедури sidebar (scrollable) -->
    <!-- [glass-panel] Stats strip -->
  </div>
  <!-- RIGHT: flex-col, gap-2 -->
  <div class="flex-1 min-w-0 flex flex-col gap-2 overflow-hidden">
    <!-- [glass-panel] Calendar grid -->
    <!-- [glass-panel] My Tasks panel -->
  </div>
</div>
```

### Компоненти для переписування

| # | Файл | Еталон в demo-design3 | Ключові CSS-класи |
|---|------|----------------------|-------------------|
| 1 | **PlannerContent.tsx** | `#cabinet-view` (рядки 631-655) — layout двох стовпців | `flex gap-2`, `w-[420px]`, `glass-panel` |
| 2 | **PlannerFilters.tsx** | `#cal-filters` (рядок 638) — year/month/week nav | `glass-panel`, `nav-group`, `nav-btn`, `.active`/`.ctx` |
| 3 | **PlannerSidebar.tsx** | `#cal-sidebar` + `renderCalSidebar()` (рядки 1374-1419) — plan-item картки | `glass-panel`, `plan-item`, `.active`, dual progress bar |
| 4 | **PlannerStats.tsx** | `#cal-stats` + `renderCalStats()` (рядки 1804-1822) — 4 stat chips | `glass-panel`, `statChip()` helper pattern |
| 5 | **PlannerGrid.tsx** | `#cal-grid-panel` + `renderCalGrid()` (рядки 1442-1612) — grid + header + legend | `glass-panel`, `cal-table`, `detail-hdr`, `hdr-sep`, `cal-footer`, `cal-legend-chip` |
| 6 | **PlannerBlocks.tsx** | cal-block rendering (рядки 1474-1514) | `data-cell cal-block st-*`, `cal-subj`, `cal-time`, `cal-proc`, `cal-actions`, `cal-icons` |
| 7 | **PlannerToolbar.tsx** | Header action buttons (рядки 1576-1588) | `detail-hdr`, `cal-action-btn`, `.accent` |
| 8 | **TasksPanel.tsx** | `#my-tasks-panel` + `renderMyTasks()` (рядки 1692-1801) | `glass-panel`, `tasks-panel`, `tasks-panel-hdr`, `task-row draft-row`, `draft-date`, `draft-desc`, `draft-hours`, `draft-select`, `section-badge`, `quick-input` |

### Правила

1. Використовувати скілл `frontend` + правила `.claude/rules/ui-design.md`
2. Читати demo-design3.html ПЕРЕД написанням кожного компоненту
3. CSS-класи з demo-design3 додати в Tailwind / globals.css або як inline стилі що точно відповідають еталону
4. НЕ копіювати старий код Cabinet — писати з нуля по макету
5. Максимум 400 рядків на компонент
6. Хуки вже створені (usePlanner, usePlannerSync, тощо) — використовувати їх
7. Після кожного компоненту — `npm run typecheck`
8. Фінальна перевірка: `npm run build`

### Mobile

demo-design3.html має mobile responsive (рядки 271-332):
- Day tabs (swipeable), FAB buttons, bottom sheet
- View toggle (day/week)
- Sidebar ховається на mobile

### Порядок

1. PlannerContent.tsx (layout)
2. PlannerFilters.tsx (навігація)
3. PlannerSidebar.tsx (процедури)
4. PlannerStats.tsx (статистика)
5. PlannerToolbar.tsx (кнопки дій)
6. PlannerGrid.tsx (сітка)
7. PlannerBlocks.tsx (блоки)
8. TasksPanel.tsx (задачі)
9. Typecheck + build + deploy
