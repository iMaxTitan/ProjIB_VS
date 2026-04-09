---
name: design-mockup
description: "Design mockup development for CS Platform. Creating/updating UI elements in demo-design3.html, maintaining design hierarchy (L0-L3), CSS tokens, element catalog. Use this skill when working with demo-design3.html, design mockup, UI elements, zones, element-card, glassmorphism styles, or any visual design work in the mockup. Also trigger when user says 'макет', 'дизайн', 'элемент дизайна', 'зона', 'плитка', 'стиль дизайна', 'дизайн 3'."
---

# Design Mockup Development

The design mockup (`public/demo-design3.html`) is the single source of truth for all UI elements. Every component in the real app must match this mockup. This skill guides you through creating, updating, and documenting design elements correctly.

## Design Hierarchy (L0–L3)

The UI has exactly 4 depth levels. Each level is visually lighter than the previous one.

```
L0  body              — page gradient background (darkest)
L1  .glass-panel      — zone container (bg: var(--depth-zone-bg), blur, 3D borders)
L2  .element-card     — element inside zone (bg: var(--depth-element-bg), 3D borders)
L3  .data-cell        — item inside element (colored status card)
```

When ИИ adds anything to the UI, first determine which level it belongs to. If unclear — ask the user.

## Decision Tree — What Element to Use

```
Need a container?
  ├── Group of elements on the page? → .glass-panel (L1: zone)
  ├── Block inside a zone? → .element-card (L2)
  │   ├── Table/grid with rounded corners? → + .cal-table (overflow:hidden, radius:12px)
  │   ├── Clickable card in a list? → + .plan-item (active: indigo border-left)
  │   └── Draggable card? → + .proc-item (cursor:grab)
  └── Colored data card? → .data-cell (L3: item)
      └── Row in a list? → .task-row (L3: item)

Need an icon button?
  ├── In toolbar/header (14×14)? → .cal-action-btn (always visible)
  └── On tile/row (11×11, hover-only)? → .action-btn-small (hidden until parent hover)
      Containers: .row-actions (in task-row), .cal-actions (in cal-block)

Where do filters + action buttons go?
  → INSIDE the element-card as .detail-hdr (NOT as a separate zone!)
  → .detail-hdr = header of cal-table/element-card
  → Contains: filters (.status-wrap), action buttons (.cal-action-btn), title
  → Followed by .hdr-sep (separator line)
  → RULE: header is PART OF the element, not a standalone zone

What is inside a cal-table element?
  → .detail-hdr (header: title/filters/action buttons + .hdr-sep)
  → body (scrollable content: grid, list, items)
  → .cal-footer / .summary-row (footer: legend, totals)
  → NOTHING ELSE. cal-table = header + body + footer. Complete element.

Need status coloring? → .st-* class on .data-cell
  distributed (blue), synced (green), draft-task (amber),
  external (slate), active (indigo), failed (red), etc.
```

## CSS Tokens — Use Variables, Not Magic Numbers

All depth-related values MUST use CSS custom properties from `:root`. Never hardcode `rgba(255,255,255,0.52)` — use `var(--depth-zone-bg)`.

Key tokens:
- `--depth-zone-bg` / `--depth-element-bg` — background opacity per level
- `--depth-zone-blur` — backdrop-filter blur for zones
- `--depth-*-border-top` / `--depth-*-border-bottom` — 3D effect borders
- `--shadow-accent` — indigo accent shadow
- `--action-color-*` — action button colors (default, hover, del, assign)

When changing a value (e.g., zone opacity) — change the token in `:root`, not in every class.

## Adding a New Element — Checklist

1. **Determine L-level** — is it a zone (L1), element (L2), or item (L3)?
2. **Check if base exists** — use decision tree above. If existing element fits — extend it, don't create new.
3. **Create CSS class** in `demo-design3.html`:
   - Use tokens for depth-related values
   - Add comment with hierarchy level: `/* extends .element-card */`
   - For L2: add `.element-card` as additional class in HTML
4. **Sync CSS to globals.css** — copy the new class to `src/styles/globals.css` (Design System section).
   This is CRITICAL: demo-design3.html is the mockup, globals.css is where React reads CSS from.
5. **Add to element catalog** (EL_CATALOG array at bottom of demo-design3.html):
   ```js
   ['.my-new-element', 'L2: element-card → my-new-element', 'extend'],
   ```
   Format: `['selector', 'Ln: description', 'category']`
   Categories: `zone`, `base`, `extend`, `action`, `detail`, `nav`
6. **Update documentation** — `.claude/rules/ui-design.md` section 14
7. **Deploy mockup to dev** — `scp -i ~/.ssh/id_nas "public/demo-design3.html" root@46.225.234.164:/opt/cs-dev/public/demo-design3.html`
8. **Verify** — preview_start → check visually → check element labels (toggle button)

## CSS Bridge — demo-design3.html ↔ globals.css

**All CSS classes from demo-design3.html are duplicated in `src/styles/globals.css`** (section "Design System").
When modifying a CSS class in demo-design3 → ALWAYS sync the change to globals.css.
When adding a new class in demo-design3 → ALWAYS add it to globals.css.

React components use `className="glass-panel"` — this works because globals.css defines `.glass-panel`.
Components NEVER use inline `style={{}}` for design-system properties — only CSS classes.

## Modifying Existing Element

1. Find the element in `demo-design3.html` CSS
2. Change token values in `:root` if depth/color change affects multiple elements
3. If only one element changes — modify its CSS class directly
4. Test with preview — visual must not break
5. Deploy to dev VPS

## Zone Layout Rules

Cabinet view has 5 zones:
```
LEFT COLUMN (420px)          RIGHT COLUMN (flex-1)
┌─────────────────────┐      ┌──────────────────────────────┐
│ filter-zone (p-2)   │      │ calendar-zone (p-2)          │
│ #cal-filters        │      │ #cal-grid-panel              │
├─────────────────────┤      │  └─ .cal-table (element-card)│
│ list-zone (p-1)     │      │     ├─ header + grid + footer│
│ #cal-sidebar        │      ├──────────────────────────────┤
│  └─ .proc-item cards│      │ tasks-zone (p-2, flex:1)     │
├─────────────────────┤      │ #my-tasks-panel              │
│ stats-zone (p-2)    │      │  └─ .cal-table (element-card)│
│ #cal-stats          │      │     └─ task rows (scroll)    │
└─────────────────────┘      └──────────────────────────────┘
```

Rules:
- All zones use `.glass-panel` (L1) — same background
- Calendar zone: `flex-shrink-0` (never compress, always full height)
- Tasks zone: `flex:1` (takes remaining space), internal scroll via `.tasks-panel-body`
- All zones have `p-2` padding (except list-zone: `p-1` because cards have own padding)

## Element Naming in Catalog

Tooltip format for element labels:
- Zones: `L1: zone` or specific name like `filter-zone`
- Elements: `L2: element-card → specific-name`
- Items: `L3: data-cell → specific-name`
- Actions: `action-btn-small` or `action-btn`

## Deploying the Mockup

ONLY the HTML file — never the full project:
```bash
scp -O -i ~/.ssh/id_nas "public/demo-design3.html" maxv@192.168.88.3:/volume1/docker/reportib/public/demo-design3.html
```

Do NOT run `bash deploy.sh` for mockup changes.

## Common Mistakes

- Adding element without `.element-card` base class → loses 3D effect and bg
- Hardcoding rgba values instead of using tokens → impossible to adjust globally
- Missing element from EL_CATALOG → no tooltip on label toggle
- Using `overflow-y:auto` on zone instead of element → scroll on wrong level
- `renderX()` function overwriting className → loses classes set in HTML
- Using `.glass-detail` for new zones → use `.glass-panel` (glass-detail is legacy)
