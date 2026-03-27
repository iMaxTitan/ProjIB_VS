/**
 * Hook for managing dirty state in CalendarReferenceContent.
 * Encapsulates template editing, employee timesheet rows, and save/cancel logic.
 */

import { useState, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import type { TimesheetCode, MonthlyWorkingDays } from '@/types/calendar';
import { generateMonthTemplate, calcWorkHours, calcWorkingDays } from '@/lib/ops/working-days';

export type CalendarPanelMode = 'view' | 'edit' | 'create';

interface CalendarTimesheet {
  user_id: string;
  days: TimesheetCode[];
}

interface Params {
  panelMode: CalendarPanelMode;
  setPanelMode: Dispatch<SetStateAction<CalendarPanelMode>>;
  selectedYear: number;
  selectedMonth: number | null;
  setSelectedMonth: Dispatch<SetStateAction<number | null>>;
  allWorkingDays: MonthlyWorkingDays[];
  timesheets: CalendarTimesheet[];
  apiCreateMonth: (params: { year: number; month: number; dayTypes: TimesheetCode[] }) => Promise<boolean>;
  updateTemplate: (year: number, month: number, dayTypes: TimesheetCode[]) => Promise<boolean>;
  updateTimesheet: (year: number, month: number, userId: string, days: TimesheetCode[]) => Promise<boolean>;
}

export function useCalendarEditState({
  panelMode,
  setPanelMode,
  selectedYear,
  selectedMonth,
  setSelectedMonth,
  allWorkingDays,
  timesheets,
  apiCreateMonth,
  updateTemplate,
  updateTimesheet,
}: Params) {
  const isCreateMode = panelMode === 'create';
  const isEditing = panelMode === 'edit';

  const [dirtyTemplate, setDirtyTemplate] = useState<TimesheetCode[] | null>(null);
  const [createMonth, setCreateMonthNum] = useState<number>(0);
  const [dirtyRows, setDirtyRows] = useState<Map<string, TimesheetCode[]>>(new Map());
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);

  const hasDirtyRows = dirtyRows.size > 0;
  const hasDirtyTemplate = dirtyTemplate !== null;
  const hasDirty = hasDirtyRows || hasDirtyTemplate;

  const effectiveTemplate = useMemo(() => {
    if (isCreateMode) return dirtyTemplate ?? [];
    const mwd = allWorkingDays.find((d) => d.year === selectedYear && d.month === selectedMonth);
    return dirtyTemplate ?? mwd?.day_types ?? [];
  }, [isCreateMode, dirtyTemplate, allWorkingDays, selectedYear, selectedMonth]);

  const effectiveWorkHours = useMemo(() => calcWorkHours(effectiveTemplate), [effectiveTemplate]);
  const effectiveWorkDays = useMemo(() => calcWorkingDays(effectiveTemplate), [effectiveTemplate]);

  const resetEditState = useCallback(() => {
    setPanelMode('view');
    setDirtyTemplate(null);
    setDirtyRows(new Map());
    setSavingRows(new Set());
    setSavingAll(false);
  }, [setPanelMode]);

  /** Resets dirty state only — does NOT touch panelMode (used when starting create mode). */
  const initCreateMode = useCallback(() => {
    setDirtyTemplate(null);
    setDirtyRows(new Map());
    setCreateMonthNum(0);
  }, []);

  const handleTemplateToggle = useCallback(
    (dayIdx: number, currentCode: TimesheetCode) => {
      if (panelMode !== 'edit' && panelMode !== 'create') return;
      const base = [...effectiveTemplate];
      if (currentCode === '8') base[dayIdx] = 'С';
      else if (currentCode === 'С') base[dayIdx] = '8';
      else return;
      setDirtyTemplate(base);
    },
    [panelMode, effectiveTemplate],
  );

  const handleCellChange = useCallback(
    (userId: string, dayIdx: number, newCode: TimesheetCode) => {
      setDirtyRows((prev) => {
        const next = new Map(prev);
        const ts = timesheets.find((t) => t.user_id === userId);
        if (!ts) return prev;
        const base = next.get(userId) ?? [...ts.days];
        base[dayIdx] = newCode;
        next.set(userId, base);
        return next;
      });
    },
    [timesheets],
  );

  const handleSaveRow = useCallback(
    async (userId: string) => {
      const days = dirtyRows.get(userId);
      if (!days || !selectedMonth) return;
      setSavingRows((prev) => new Set(prev).add(userId));
      try {
        const ok = await updateTimesheet(selectedYear, selectedMonth, userId, days);
        if (ok) {
          setDirtyRows((prev) => { const n = new Map(prev); n.delete(userId); return n; });
        }
      } finally {
        setSavingRows((prev) => { const n = new Set(prev); n.delete(userId); return n; });
      }
    },
    [dirtyRows, selectedYear, selectedMonth, updateTimesheet],
  );

  const handleSaveAll = useCallback(async () => {
    setSavingAll(true);
    try {
      if (isCreateMode && createMonth > 0 && dirtyTemplate) {
        const ok = await apiCreateMonth({ year: selectedYear, month: createMonth, dayTypes: dirtyTemplate });
        if (ok) {
          setSelectedMonth(createMonth);
          resetEditState();
        }
        return;
      }

      if (!selectedMonth) return;

      if (hasDirtyTemplate && dirtyTemplate) {
        const ok = await updateTemplate(selectedYear, selectedMonth, dirtyTemplate);
        if (ok) resetEditState();
        return;
      }

      if (hasDirtyRows) {
        const entries = Array.from(dirtyRows.entries());
        setSavingRows(new Set(entries.map(([id]) => id)));
        const results = await Promise.allSettled(
          entries.map(([userId, days]) =>
            updateTimesheet(selectedYear, selectedMonth, userId, days),
          ),
        );
        const savedIds = new Set<string>();
        results.forEach((r, i) => {
          if (r.status === 'fulfilled' && r.value) savedIds.add(entries[i][0]);
        });
        if (savedIds.size === entries.length) {
          resetEditState();
        } else if (savedIds.size > 0) {
          setDirtyRows((prev) => {
            const next = new Map(prev);
            savedIds.forEach((id) => next.delete(id));
            return next;
          });
        }
      }
    } finally {
      setSavingAll(false);
      setSavingRows(new Set());
    }
  }, [
    isCreateMode, createMonth, dirtyTemplate, selectedMonth, selectedYear,
    hasDirtyTemplate, hasDirtyRows, dirtyRows,
    apiCreateMonth, updateTemplate, updateTimesheet, resetEditState, setSelectedMonth,
  ]);

  const handleCancelEdit = useCallback(() => {
    if (isCreateMode) setCreateMonthNum(0);
    resetEditState();
  }, [isCreateMode, resetEditState]);

  const handleStartEdit = useCallback(() => {
    setPanelMode('edit');
  }, [setPanelMode]);

  const handleCreateMonthSelect = useCallback(
    (m: number) => {
      setCreateMonthNum(m);
      setDirtyTemplate(generateMonthTemplate(selectedYear, m));
    },
    [selectedYear],
  );

  return {
    dirtyTemplate,
    setDirtyTemplate,
    createMonth,
    setCreateMonthNum,
    dirtyRows,
    savingRows,
    savingAll,
    effectiveTemplate,
    effectiveWorkHours,
    effectiveWorkDays,
    hasDirtyRows,
    hasDirtyTemplate,
    hasDirty,
    isEditing,
    isCreateMode,
    resetEditState,
    initCreateMode,
    handleTemplateToggle,
    handleCellChange,
    handleSaveRow,
    handleSaveAll,
    handleCancelEdit,
    handleStartEdit,
    handleCreateMonthSelect,
  };
}
