---
paths:
  - "src/components/**/*.tsx"
  - "src/app/**/*.tsx"
  - "public/demo-*.html"
---

# UI Design System Rules

IMPORTANT: These rules are NOT optional. Follow for EVERY UI change.
Visual reference: `demo-design-system.html` (open in browser to see all standards).

## CRITICAL: When Element Doesn't Fit Standard

If a UI element CANNOT be implemented using the standards below:
1. STOP — do NOT improvise or create a one-off style
2. ASK the user: "Этот элемент не вписывается в текущий стандарт дизайна. Нужно создать новый стандартный стиль. Как он должен выглядеть?"
3. After approval — add the new standard to `demo-design-system.html` + this file
4. ONLY THEN implement

## 0. CSS Design System Bridge — MANDATORY

**All design classes from `demo-design3.html` are available in `src/styles/globals.css`.**
CSS tokens (variables) and classes are synced — use them directly in React components.

### Usage Rules
```
ALWAYS:
  className="glass-panel rounded-xl p-2"          // L1 zone
  className="element-card cal-table"               // L2 element
  className="data-cell cal-block st-synced"        // L3 item with status
  className="nav-group" / className="nav-btn active" // navigation
  className="task-row draft-row"                   // task rows
  className="cal-action-btn" / "action-btn-small"  // icon buttons

NEVER:
  style={{ background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(16px)', ... }}
  // ↑ This is the #1 cause of design drift. Use CSS classes instead.

TAILWIND — only for layout:
  flex, grid, gap-*, p-*, m-*, w-*, h-*, hidden, lg:flex, overflow-*
  // ↑ Tailwind is for positioning, not for visual appearance.
```

### Verification Checklist (after writing UI code)
- [ ] No inline `style={{}}` for glass/element/data-cell/nav — use CSS classes
- [ ] Status colors use `.st-*` classes, not inline rgba
- [ ] Action buttons use `.cal-action-btn` or `.action-btn-small`, not custom styles
- [ ] Large touched components move new responsibility into nearby modules instead of growing one more mixed-responsibility file

---

## 1. Color Palette — ONLY `slate` for neutrals

```
ALLOWED:  text-slate-*, bg-slate-*, border-slate-*
FORBIDDEN: text-gray-*, bg-gray-*, border-gray-*  (migrate on touch)
```

Semantic colors: `indigo` (primary), `emerald` (success), `amber` (warning), `red` (error/destructive), `blue` (info), `purple` (category accent).

## 2. Typography — Fixed Classes (no variations)

| Level   | Tailwind                              | When                          |
|---------|---------------------------------------|-------------------------------|
| h1      | `text-xl font-bold text-slate-900`    | Page/panel detail title       |
| h2      | `text-lg font-semibold text-slate-800`| Section inside panel          |
| h3      | `text-base font-semibold text-slate-700`| Card/subsection name       |
| body    | `text-sm text-slate-700`              | Main text, descriptions       |
| muted   | `text-sm text-slate-500`              | Helper text, timestamps       |
| caption | `text-xs text-slate-500`              | Metadata, counts              |
| label   | `text-sm font-medium text-slate-700`  | ALL form labels (every module)|

FORBIDDEN: `text-gray-*` in any typography. `font-bold` only for h1 and table totals.

## 3. Badges — ONE size, semantic colors

```
Standard: text-xs px-2 py-0.5 rounded-full font-medium
```

| Variant      | Classes                                    |
|--------------|--------------------------------------------|
| neutral      | `bg-slate-100 text-slate-600`              |
| primary      | `bg-indigo-100 text-indigo-700`            |
| success      | `bg-emerald-100 text-emerald-700`          |
| warning      | `bg-amber-100 text-amber-700`              |
| error        | `bg-red-100 text-red-700`                  |
| info         | `bg-blue-100 text-blue-700`                |
| category     | `bg-purple-100 text-purple-700`            |

With icon: add `inline-flex items-center gap-1` + `w-3 h-3` icon.
FORBIDDEN: `text-[10px]`, `text-2xs`, `px-1.5`, `px-3 py-1.5` — one size only.

## 4. Buttons — ALWAYS `<Button>` component

```tsx
import { Button } from '@/components/ui/Button';
// Sizes: xs, sm, md, lg, xl, icon
// Variants: default, destructive, outline, secondary, ghost, link, success, warning
```

Dashboard standard size: **sm** for toolbars and panels.
FORBIDDEN: Raw `<button className="px-3 py-2 bg-indigo-500...">` — use Button component.

### Icon buttons in gradient headers:
```
p-2 hover:bg-white/20 rounded-xl transition-colors text-white/80 hover:text-white
Delete: hover:bg-red-500/25
Icon: w-4 h-4
```

## 5. Tables — ReportTableStyles.ts

ALL report tables use `reportTableStyles` from `ReportTableStyles.ts`:

| Element        | Standard                                                        |
|----------------|-----------------------------------------------------------------|
| Frame          | `rounded-xl border border-slate-200 bg-white shadow-sm`        |
| Table          | `w-full text-xs table-fixed`                                    |
| Thead          | `sticky top-0 z-10`                                             |
| Header row     | `border-b border-slate-200 bg-slate-50/50 text-slate-600`      |
| th cell        | `px-1.5 py-1.5 font-semibold` + `border-r border-slate-200/80` |
| Body row       | `border-b border-slate-100 hover:bg-indigo-50/30 align-top`    |
| Zebra (odd)    | `bg-slate-50/30`                                                |
| td cell        | `px-1.5 py-1.5 text-slate-700 tabular-nums` + `border-r border-slate-100` |
| Zero values    | `text-slate-300`                                                |
| Footer         | `border-t-2 border-slate-300 bg-slate-50 font-bold`            |
| Grand total    | `font-bold text-indigo-700`                                     |
| Segmented tabs | `reportSegmentedButtonClass()` — never custom radio buttons     |
| Action buttons | `reportActionButtonClass('ai'|'pdf'|'docx')`                   |

## 6. Shared Dashboard Components — MANDATORY

Desktop dashboard default is a three-panel layout:

- left panel: navigation, filters, selectable lists, secondary stats
- center panel: main working surface, matrix, table, or primary content
- right panel: selected item details, inspector, actions, or secondary context

Use `ThreePanelLayout` by default for new desktop dashboard screens that need navigation + work area + details.
Use `TwoPanelLayout` only when the feature is genuinely simpler and there is no persistent third responsibility.

FORBIDDEN: Creating custom versions of existing shared components.

```tsx
import {
  ThreePanelLayout,    // Default desktop dashboard layout. Prefer this first.
  TwoPanelLayout,      // Secondary pattern for simpler screens only.
  DashboardTopTabs,    // Top tabs. NO custom tab buttons.
  ReferenceListItem,   // Clickable list items. NO custom list buttons.
  DetailSection,       // Section with title in details panel.
  GradientDetailCard,  // Gradient header card with action buttons.
  GroupHeader,         // Group separator with count badge.
  DashboardStatCard,   // Stat card. NO inline stat badges.
  FilterBar,           // Search + filters. NO custom search inputs.
  ExpandableListItem,  // Collapsible list item.
  MobileDetailsFab,    // FAB for mobile.
} from '@/components/dashboard/shared';
```

New shared component needed? → Add to `shared/` + export from `index.ts` + add to `demo-design-system.html` + update this file.

## 7. Forms — Unified Style

```
Label:    text-sm font-medium text-slate-700 mb-1
Input:    w-full px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-700
          placeholder-slate-400 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300
Error:    border-red-300 + text-xs text-red-600 mt-1
Hint:     text-xs text-slate-500 mt-1
```

## 8. Empty States — Standard Structure

```
Container: flex flex-col items-center justify-center text-center p-8
Icon box:  w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-4
Icon:      w-6 h-6 text-slate-400
Title:     text-base font-semibold text-slate-700 mb-1
Desc:      text-sm text-slate-500 mb-4
Action:    <Button> (optional)
```

## 9. Loading — Skeleton + Spinner

Skeleton (lists/cards/tables): `animate-pulse` blocks matching content shape.
```
Skeleton bg: bg-slate-200 rounded-full (text) / rounded-xl (blocks)
Lighter:     bg-slate-100
```

Spinner (inline/buttons only): `w-5 h-5 border-2 rounded-full border-indigo-500 border-t-transparent animate-spin`

## 10. Errors & Notifications

```
Inline error:   p-3 bg-red-50 border border-red-100 rounded-xl + text-sm text-red-600
Inline warning:  p-3 bg-amber-50 border border-amber-100 rounded-xl + text-sm text-amber-700
Toast:          toast.success() / toast.error() / toast.warning() from sonner
```

FORBIDDEN: `window.confirm()`, `window.alert()`, `console.log` in components.

## 11. Quick Checklist

1. **Colors** — `slate-*` for neutrals, NEVER `gray-*`. Semantic colors for accents.
2. **Layout** — desktop dashboard defaults to three panels; do not hand-roll custom split layouts when `ThreePanelLayout` fits
3. **Accessibility** — aria-label on every interactive element, aria-hidden on icons
4. **Focus** — `focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2`
5. **Animations** — `transition-[transform,opacity] duration-base`, never `transition-all`
6. **Interactive div** — needs `role="button"` + `tabIndex={0}` + `onKeyDown`
7. **Responsive** — mobile-first, with filters collapsed appropriately and side panels exposed via existing FAB/drawer patterns when applicable

## 12. CSS Utilities (globals.css)

```
gradient-primary / gradient-indigo / gradient-success / gradient-warning / gradient-error
glass-card / glass-panel / glass-effect / glass-effect-strong
focus-ring / focus-ring-error
animate-press / animate-fade-in / animate-slide-in / animate-scale
card-base / card-hover
```

## When Editing Existing Components

If you see code violating these standards — FIX it:
- `gray-*` → `slate-*`
- Raw `<button>` → `<Button>` component
- Custom list items → `ReferenceListItem`
- Custom tabs → `DashboardTopTabs` or `reportSegmentedButtonClass()`
- Missing aria-label → add it
- `transition-all` → specific transitions
- Inconsistent typography → match the table in section 2

Full visual reference: `demo-design-system.html`
Full docs: `docs/UI_DESIGN_SYSTEM.md`, `docs/TWO_PANEL_TAB_STANDARD.md` (legacy/simple pattern reference)

---

## 13. Design Hierarchy (L0–L3)

Visual reference: `demo-design3.html` (Plan2 + Cabinet — unified design).

### Depth Levels

```
L0  body            — page background (gradient, darkest)
L1  .glass-panel    — zone container (semi-transparent 0.52, 3D borders)
L2  .element-card   — element inside zone (white 0.92, 3D borders)
    aliases: .plan-item, .proc-item, .cal-table
L3  .data-cell      — item inside element (colored card)
    aliases: .cal-block, .task-row, .draft-row
```

Each level is visually lighter than the previous: background gradient → zone → element → item.

### Screen Layout

```
+-------------------------------------------------------------+
|  TOP BAR (gradient indigo, h:48px, role badges)              |
+-------------+-----------------------------------------------+
|  L1: ZONE   |  L1: ZONE (glass-panel)                       |
|  (glass-    |  +------------------------------------------+  |
|   panel)    |  | L2: element-card (cal-table / detail)    |  |
|             |  |  +--------------------------------------+|  |
|  filter-zone|  |  | L3: items (cal-block / task-row)     ||  |
|             |  |  +--------------------------------------+|  |
|  list-zone  |  +------------------------------------------+  |
|  (L2 cards) |  | L2: element-card (tasks)                 |  |
|             |  +------------------------------------------+  |
|  stats-zone |                                                |
+-------------+-----------------------------------------------+
```

### Zones by View

| Zone | View | Purpose |
|------|------|---------|
| **filter-zone** | Both | Year/month/week navigation |
| **list-zone** | Both | Selectable cards (plans, procedures) |
| **stats-zone** | Both | Summary statistics |
| **calendar-zone** | Cabinet | Calendar grid (contains cal-table) |
| **tasks-zone** | Cabinet | My tasks (flex:1, internal scroll) |
| **content-zone** | Plan2 | Matrix grid |
| **detail-zone** | Plan2 | Selected item details |
| **filter-zone (right)** | Plan2 | Status filters + action buttons |

### Element Decision Tree (for AI agents)

```
Need a container?
  ├── Group of elements on the page? → .glass-panel (L1: zone)
  ├── Block inside a zone? → .element-card (L2)
  │   ├── Table/grid with rounded corners? → + .cal-table
  │   ├── Clickable card in a list? → + .plan-item
  │   └── Draggable card? → + .proc-item
  └── Colored data card? → .data-cell (L3: item)
      └── Row in a list? → .task-row (L3: item)

Need an icon button?
  ├── In toolbar/header (14×14)? → .cal-action-btn
  └── On tile/row (11×11, hover-only)? → .action-btn-small
      Containers: .row-actions (task-row), .cal-actions (cal-block)

Need status coloring? → .st-* class on .data-cell

Where do filters + action buttons go?
  → INSIDE element-card as .detail-hdr (NOT a separate zone!)
  → .detail-hdr = header of cal-table, contains filters + action buttons
  → Followed by .hdr-sep separator

What is inside a cal-table?
  → .detail-hdr (header: filters/title/action buttons + .hdr-sep)
  → body (scrollable: grid, list, items)
  → .cal-footer / .summary-row (footer: legend, totals)
  → NOTHING ELSE. cal-table = header + body + footer.

Depth values? → Use CSS tokens: var(--depth-zone-*), var(--depth-element-*)
  NEVER hardcode rgba values for backgrounds/borders
```

---

## 14. Element Architecture — Base → Extends

Every UI element follows a **base → view-specific** inheritance. NEVER create a new element without checking this catalog first. If element not found → ASK user.

### L2: Element Card (base for all elements inside zones)

| Element | CSS class | What it defines |
|---------|-----------|-----------------|
| **element-card** | `.element-card` | `bg:rgba(255,255,255,0.92); radius:10px; 3D borders (top light, bottom dark); inset shadows` |
| **→ cal-table** | `.cal-table` | `extends element-card; radius:12px; overflow:hidden` — wraps calendar grid + header + footer |
| **→ sidebar-card** | `.plan-item` | `extends element-card; active:border-left 2px indigo+indigo bg` |
| **→ proc-item** | `.proc-item` | `extends element-card; cursor:grab; active:border-left 3px` |

### L3: Items (inside elements)

| Item | CSS class | What it defines |
|------|-----------|-----------------|
| **data-cell** | `.data-cell` | `padding:5px 8px; border-left:3px; radius:8px; hover:translateY(-1px)+shadow; status colors via .st-*` |
| **task-row** | `.task-row` | `display:flex; gap:8px; border-bottom:1px; hover:bg white/60%` |

### Action Buttons (two sizes)

| Element | CSS class | What it defines |
|---------|-----------|-----------------|
| **action-btn** | `.cal-action-btn` | `icon 14×14; padding:5px; no bg; #cbd5e1→#6366f1 hover; .accent:#a5b4fc→#6366f1` |
| **action-btn-small** | `.action-btn-small` | `icon 11-12×12; padding:2px; no bg; #cbd5e1→#6366f1 hover; .act-del→red` |

Containers for action-btn-small: `.row-actions` (in task-row), `.cal-actions` (in cal-block) — `opacity:0→1` on parent hover.

### Other Base Elements

| Element | CSS class | What it defines |
|---------|-----------|-----------------|
| **cal-footer** | `.cal-footer` | Legend inside cal-table. `flex-wrap; gap:6px; border-top; bg:slate-50/40%` |
| **stat-chip** | `statChip()` JS | `value 13px/700 + label 9px/600; colored bg+border` |
| **progress-color** | `progressColor()` JS | `≥100% green, ≥70% blue, ≥40% amber, <40% red` |
| **summary-row** | inline | `border-top:1px; bg:slate-100/50%; uppercase "РАЗОМ"` |
| **detail-header** | `.detail-hdr` + `.hdr-sep` | `gradient indigo/purple bg; title + icon buttons` |
| **section-badge** | `.section-badge` | `uppercase; 10px/700; .amber .sky variants` |

### View-Specific Extends

| Extends | CSS class | View | Differences from base |
|---------|-----------|------|-----------------------|
| data-cell → **matrix-cell** | `.pp-matrix-cell` | План2 | `flex-direction:column; min-height:60px; .cell-pct/.cell-hours/.cell-bar` |
| data-cell → **cal-block** | `.cal-block` | Кабінет | `position:absolute; left/right:2px; hover:expand height; .cal-subj/.cal-time/.cal-proc/.cal-actions` |
| task-row → **plan-task-row** | `.pp-task-row` | План2 | `padding:8px 16px; .pp-task-check checkbox` |
| task-row → **draft-row** | `.draft-row` | Кабінет | `padding:8px 16px; .draft-date/.draft-desc/.draft-hours/.draft-select/.draft-assign-btn` |
| sidebar-card → **proc-item** | `.proc-item` | Кабінет | `cursor:grab (draggable); .proc-active:border-left 3px` |
| sidebar-card → **pp-tile** | `.pp-tile` | План2 | `colored border+bg per process; .pp-name/.pp-dept/.pp-meta/.pp-bar` |

### Navigation & Filters (shared)

| Element | Description | CSS | Used in |
|---------|-------------|-----|---------|
| **filter-scroll** | Nav with arrows, center = selected under glass | `.nav-group` + `.nav-btn` + `.nav-btn.active` | Years, months (both views) |
| **filter-select** | All buttons visible, no-data = disabled (opacity 0.3) | `.nav-group` + `.nav-btn` + `:disabled` | Quarters, weeks (both views) |
| **nav-btn.ctx** | Parent-context: brighter than active (indigo bg 28%, white text, elevated) | `.nav-btn.ctx` | Selected quarter when viewing month (both views) |
| **filter-chips** | Colored pill chips, 10px/600, radius 6px | `.cal-legend-chip` | Calendar legend, status labels (both views) |
| **filter-status** | Segmented pill: inset bg, active = gradient+glow, 11px/500-600 | `.status-wrap` | Status filter (both views) |

### L1: Zone Styles

| CSS class | Level | Description |
|-----------|-------|-------------|
| `.glass-panel` | L1: zone | All zones. `bg:0.52; blur:16px; 3D borders+shadows` |
| `.glass-detail` | L1: zone (legacy) | Right panel variant. Prefer `.glass-panel` for new zones |
| `.glass-header` | sub-zone | Calendar/detail section header. `bg:0.5; blur:12px` |
| `.glass-meta` | sub-zone | Breadcrumb/meta strip. `bg:slate-50/50%; blur:8px` |
| `.glass-input` | form | Text inputs, selects. `bg:0.6; blur:8px; border` |

### Detail Panel Elements (shared)

| Element | CSS class | Description |
|---------|-----------|-------------|
| **info-card** | `.info-card` | Glass content card in detail panel. `margin:3px 16px; radius:12px; glass bg` |
| **inset-box** | `.inset-box` | Sunken content area. `bg:slate-50/65%; inset shadow; radius:10px; padding:11px 14px` |
| **stat-cell** | `.stat-cell` | Individual stat in hours-grid. `bg:slate-50/65%; inset shadow; radius:10px` |
| **hours-grid** | `.hours-grid` | 3-column grid for stat-cells. `padding:3px 16px; gap:8px` |
| **meta-strip** | `.meta-strip` | Breadcrumb line. `flex; gap:8px; padding:4px 16px` |
| **prop-label** | `.prop-label` | Uppercase property label. `10px/600; slate-400; letter-spacing:0.06em` |
| **sec-label** | `.sec-label` | Uppercase section heading. `10px/600; slate-400; uppercase` |

### Кабінет-only Elements

| Element | CSS class | Description |
|---------|-----------|-------------|
| **cal-table** | `.element-card.cal-table` | L2 element wrapping calendar (header+grid+legend). `radius:12px; overflow:hidden` |
| **cal-footer** | `.cal-footer` | Legend bar inside cal-table. `flex-wrap; gap:6px; border-top; bg:slate-50/40%` |
| **cal-tool-btn** | `.cal-tool-btn` | Toolbar button with icon+text. `radius:8px; border; glass bg; 12px/500`. `.primary` = gradient indigo |
| **ai-suggest-btn** | `.ai-suggest-btn` | AI suggest button. `10px/600; indigo accent; border+bg` |
| **action-btn-small** | `.action-btn-small` | Small icon button, hidden until parent hover. `2px pad; #cbd5e1→#6366f1; .act-del→red; .act-assign→emerald` |
| **quick-input-row** | `.quick-input-row` | Quick task add: input + button. `padding:8px 14px; gap:6px` |
| **quick-add-btn** | `.quick-add-btn` | Amber gradient submit. `11px/600; radius:8px; shadow` |
| **mob-day-tabs** | `.mob-day-tabs` | Mobile day selector tabs |
| **mob-bottom-sheet** | `.mob-bottom-sheet` | Mobile bottom sheet with handle |
| **mob-fab** | `.mob-fab` | Mobile floating buttons (`.procs` indigo, `.tasks` amber) |
| **mob-view-toggle** | `.mob-view-toggle` | Mobile day/week toggle |

### План2-only Elements

| Element | CSS class | Description |
|---------|-----------|-------------|
| **pp-grid-hdr** | `.pp-grid-hdr` | Matrix column header. `12px/700; center; border-bottom` |
| **pp-grid-proc** | `.pp-grid-proc` | Matrix row label. `12px/600; border-right; bg slate-50` |
| **pp-plan-card** | `.pp-plan-card` | Expandable plan card with colored header |
| **pp-emp-row** | `.pp-emp-row` | Employee workload bar row. `flex; gap:8px; padding:5px 12px` |
| **child-card** | `.child-card` | Quarter/month card in detail. Glass bg, `.empty` = dashed border |
| **emp-card** | `.emp-card` | Employee card. `radius:12px; border; shadow; hover:indigo glow` |
| **pp-task-check** | `.pp-task-check` | Task checkbox. `16×16; radius:4px; .done=emerald, .pending=slate border` |
| **pp-tasks-hdr** | `.pp-tasks-hdr` | Collapsible tasks panel header. `flex; justify:space-between; padding:8px 16px; border-top; bg:slate-50/40%` |
| **pp-hdr-btn** | `.pp-hdr-btn` | action-btn variant in detail header (add task, close). Same icon style |

### Detail-zone Decomposition (shared structure, used in Plan2 + Cabinet detail panels)

| Element | CSS class | Description |
|---------|-----------|-------------|
| **detail-wrap** | `.detail-wrap` | Root flex-column container. `border-top:1px; height:100%` |
| **detail-summary-hdr** | `.detail-summary-hdr` | Fixed header block (not scrollable). `padding:10px 16px; bg:slate-50/50%; flex-shrink:0` |
| **detail-title-row** | `.detail-title-row` | Row: color-bar + meta + action buttons. `flex; gap:8px` |
| **detail-color-bar** | `.detail-color-bar` | Vertical accent bar. `4px×20px; radius:2px; process color` |
| **detail-meta-inline** | `.detail-meta-inline` | Inline meta: month, status badge, hours, %. `flex; gap:6px` |
| **detail-status-badge** | `.detail-status-badge` | Status pill in header. `9px/600; radius:4px; colored bg+text` |
| **detail-quote** | `.detail-quote` | Description block. `11px; slate-500; border-left:2px accent; padding-left:12px` |
| **detail-companies** | `.detail-companies` | Company chips row. `flex; gap:4px; wrap` |
| **company-chip** | `.company-chip` | Single company chip. `10px/500; indigo bg 8%; radius:4px; padding:2px 6px` |
| **tasks-scroll** | `.tasks-scroll` | Scrollable tasks container. `flex:1; overflow-y:auto` |
| **emp-group-hdr** | `.emp-group-hdr` | Employee group header. `flex; gap:8px; padding:6px 16px; bg:slate-50/30%; border-top` |
| **emp-avatar** | `.emp-avatar` | Employee initials badge. `26×26; radius:7px; colored bg+border; 8px/700 initials` |
| **summary-row** | `.summary-row` | Totals footer (РАЗОМ). `flex; padding:8px 16px; border-top; bg:slate-50/50%; uppercase 10px/700` |

### Shared (not yet listed)

| Element | CSS class | Description |
|---------|-----------|-------------|
| **sec-tab** | `.sec-tab` | Section navigation tab. `13px/500; border-bottom:2px; .active = indigo + font-weight:600` |

Action buttons can appear anywhere — in headers, toolbars, task rows, card corners, inline controls. Regardless of location, they always follow the same style: icon 14×14, no background, no border, slate→indigo hover. Group with `gap:3px`. Primary action = `.accent`. Destructive = red hover. No text labels — only `title` for tooltip.

---

## 15. Status Color Classes

All data cells (`.data-cell`) use `.st-*` CSS classes for status-based coloring. Same palette for both calendar events and plan grid cells.

| Class | Color | Use for |
|-------|-------|---------|
| `.st-distributed` | blue `rgba(59,130,246)` | Distributed to calendar |
| `.st-synced` | green `rgba(16,185,129)` | Synced with Outlook |
| `.st-completed` / `.st-in-task` | green `rgba(16,185,129)` | Completed / assigned to task |
| `.st-draft-task` / `.st-returned` | amber `rgba(245,158,11)` | Draft task / returned for revision |
| `.st-external` / `.st-draft` | slate `rgba(148,163,184)` | External event / draft plan |
| `.st-submitted` | blue `rgba(59,130,246)` | Submitted for approval |
| `.st-approved` | cyan `rgba(8,145,178)` | Approved |
| `.st-active` | indigo `rgba(99,102,241)` | Active / in progress |
| `.st-failed` | red `rgba(239,68,68)` | Failed / overdue |

Each class provides: `background` (12% opacity), `border-left-color` (solid), `color` (dark shade), `box-shadow` (subtle glow). Hover state increases shadow to `0 4px 16px`.
