# Calendar Task Picker — Design

## Suть

Klick na blok protsedury v tyzhevomu planeri -> inline dropdown z zadachamy -> vybrav -> zadacha pryvyazalas -> tryvalist bloku = spent_hours.

## UX Flow

1. Klik na blok protsedury -> pid blokom zyavlyayetsya kompaktnyy dropdown
2. Dropdown maye 3 sektsii:
   - Shablony — z procedure_task_templates tsiei protsedury
   - V roboti — incomplete zadachi tsiei protsedury (shche ne na kalendari)
   - Vid kerivnytstva — chief/head zadachi tsiei protsedury
3. Vybir shablonu -> stvoryuyetsya nova daily_task (source='template', date=data bloku, spent_hours z tryvalist bloku)
4. Vybir isnuyuchoi -> privyazuyetsya daily_task_id do calendar entry, onovlyuyetsya date i spent_hours
5. Resize bloku -> avtosynk spent_hours v privyazanu zadachu
6. Zbir v kintsi tyzhnya — isnuyucha knopka "Zibrary" v protsedurakh grupuye odnakovi

## Zminy v danykh

- weekly_calendar_entries.daily_task_id — vzhe ye FK
- Pry resize: PATCH entry -> trigger update daily_tasks.spent_hours
- Novyy endpoint abo rozshyrennya isnuyuchogo weekly-planner

## Responsive

- Desktop: inline dropdown pid blokom (Portal)
- Mobile (<640px): bottom sheet (znizu ekranu)
- Odyn komponent TaskPickerDropdown, useMediaQuery perekmykaye layout

## Fayly

| Fayl | Diya |
|------|------|
| WeeklyPlannerBlocks.tsx | Zminyty — dodaty onClick -> TaskPickerDropdown |
| TaskPickerDropdown.tsx (novyy) | UI dropdown/bottom-sheet z 3 sektsiyamy |
| calendar-entries-write.ts | Zminyty — linkTask + auto spent_hours on resize |
| weekly-planner API | Zminyty — endpoint dlya link/unlink task |
| useWeeklyPlanner.ts | Zminyty — dodaty mutation linkTaskToEntry |
