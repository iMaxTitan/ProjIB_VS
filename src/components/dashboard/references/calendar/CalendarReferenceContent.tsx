'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { CalendarDays, UserPlus } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import type { MonthlyWorkingDays } from '@/types/calendar';
import { useAllEmployees } from '@/hooks/useEmployees';
import { useWorkCalendar, useWorkCalendarYears } from '@/hooks/useWorkCalendar';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { TwoPanelLayout, GradientDetailCard } from '../../shared';
import ReferenceDetailsEmptyState from '../ReferenceDetailsEmptyState';
import {
  MiniCalendarGrid,
  TimesheetGrid,
  AddEmployeeModal,
  CalendarLeftPanel,
} from '.';
import { useCalendarEditState } from '@/hooks/useCalendarEditState';
import type { CalendarPanelMode } from '@/hooks/useCalendarEditState';

const MONTH_NAMES = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export default function CalendarReferenceContent({ user, tabsSlot }: { user: UserInfo; tabsSlot?: React.ReactNode }) {
  const isMobile = useIsMobile();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({
    [currentYear]: true,
  });
  const [showAddEmployee, setShowAddEmployee] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<CalendarPanelMode>('view');

  const canEdit = user.role === 'chief' || user.role === 'head';

  const {
    workingDaysList,
    timesheets,
    loadingTimesheets,
    error,
    createMonth: apiCreateMonth,
    deleteMonth,
    addEmployees,
    updateTemplate,
    updateTimesheet,
    removeEmployee,
  } = useWorkCalendar(selectedYear, selectedMonth ?? undefined);

  const { employees: allEmployees } = useAllEmployees();

  const years = useMemo(() => {
    const result = [currentYear];
    if (currentYear - 1 >= 2020) result.unshift(currentYear - 1);
    result.push(currentYear + 1);
    return result;
  }, [currentYear]);

  const { data: allWorkingDays, isLoading: allYearsLoading } = useWorkCalendarYears(years);

  const {
    createMonth,
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
  } = useCalendarEditState({
    panelMode, setPanelMode,
    selectedYear, selectedMonth, setSelectedMonth,
    allWorkingDays,
    timesheets,
    apiCreateMonth,
    updateTemplate,
    updateTimesheet,
  });

  const handleStartCreate = useCallback((year: number) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    setPanelMode('create');
    initCreateMode();
    if (isMobile) setIsDrawerOpen(true);
  }, [isMobile, initCreateMode]);

  const existingMonths = useMemo(
    () => workingDaysList.map((d) => d.month),
    [workingDaysList],
  );

  const availableMonths = useMemo(
    () => Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => !existingMonths.includes(m)),
    [existingMonths],
  );

  // Auto-select first available month when entering create mode
  useEffect(() => {
    if (isCreateMode && createMonth === 0 && availableMonths.length > 0) {
      handleCreateMonthSelect(availableMonths[0]);
    }
  }, [isCreateMode, createMonth, availableMonths, handleCreateMonthSelect]);

  const monthsByYear = useMemo(() => {
    const map = new Map<number, MonthlyWorkingDays[]>();
    for (const y of years) map.set(y, []);
    for (const mwd of allWorkingDays) {
      const list = map.get(mwd.year);
      if (list) list.push(mwd);
    }
    return map;
  }, [allWorkingDays, years]);

  const selectedMonthData = useMemo(
    () => allWorkingDays.find((d) => d.year === selectedYear && d.month === selectedMonth),
    [allWorkingDays, selectedYear, selectedMonth],
  );

  const toggleYear = useCallback((y: number) => {
    setExpandedYears((prev) => ({ ...prev, [y]: !prev[y] }));
  }, []);

  const handleSelectMonth = useCallback(
    (y: number, m: number) => {
      if (y !== selectedYear || m !== selectedMonth) resetEditState();
      setSelectedYear(y);
      setSelectedMonth(m);
      if (isMobile) setIsDrawerOpen(true);
    },
    [isMobile, selectedYear, selectedMonth, resetEditState],
  );

  const handleDeleteMonth = useCallback(
    async (y: number, m: number) => {
      await deleteMonth(y, m);
      if (selectedMonth === m) {
        setSelectedMonth(null);
        resetEditState();
      }
    },
    [deleteMonth, selectedMonth, resetEditState],
  );

  const handleAddEmployees = useCallback(
    async (userIds: string[]) => {
      if (!selectedMonth) return;
      await addEmployees(selectedYear, selectedMonth, userIds);
    },
    [addEmployees, selectedYear, selectedMonth],
  );

  const handleRemoveEmployee = useCallback(
    (userId: string) => {
      if (!selectedMonth) return;
      removeEmployee(selectedYear, selectedMonth, userId);
    },
    [removeEmployee, selectedYear, selectedMonth],
  );

  const existingUserIds = useMemo(
    () => new Set(timesheets.map((t) => t.user_id)),
    [timesheets],
  );

  const totalMonths = allWorkingDays.length;

  // ── Right Panel: Create mode ──
  const createPanel = (
    <GradientDetailCard
      modeLabel="Створити"
      isEditing
      canEdit
      gradientClassName="from-emerald-400/80 to-teal-400/80"
      headerIcon={<CalendarDays />}
      headerContent={
        <span className="text-lg font-bold truncate flex-1">
          Новий місяць — {selectedYear}
        </span>
      }
      onSave={createMonth > 0 ? handleSaveAll : undefined}
      onCancel={handleCancelEdit}
      saving={savingAll}
    >
      <div>
        <label htmlFor="create-month-select" className="block text-sm font-medium text-slate-700 mb-1">
          Місяць
        </label>
        <select
          id="create-month-select"
          value={createMonth}
          onChange={(e) => handleCreateMonthSelect(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-ring"
          aria-label="Вибір місяця"
        >
          <option value={0} disabled>Оберіть місяць</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>{MONTH_NAMES[m]}</option>
          ))}
        </select>
      </div>

      {createMonth > 0 && effectiveTemplate.length > 0 && (
        <MiniCalendarGrid
          year={selectedYear}
          month={createMonth}
          days={effectiveTemplate}
          onDayClick={handleTemplateToggle}
        />
      )}

      {createMonth > 0 && effectiveTemplate.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm text-slate-600">
          <span>Робочих днів: <strong className="text-emerald-700">{effectiveWorkDays}</strong></span>
          <span>Годин: <strong className="text-emerald-700">{effectiveWorkHours}</strong></span>
        </div>
      )}

      {availableMonths.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">Всі місяці вже створені</p>
      )}
    </GradientDetailCard>
  );

  // ── Right Panel: View/Edit mode ──
  const modeLabel = isEditing ? 'Редагування' : 'Перегляд';

  const detailPanel = selectedMonth && selectedMonthData ? (
    <GradientDetailCard
      modeLabel={modeLabel}
      isEditing={isEditing}
      canEdit={canEdit}
      gradientClassName="from-emerald-400/80 to-teal-400/80"
      headerIcon={<CalendarDays />}
      headerContent={
        <span className="text-lg font-bold truncate flex-1">
          {MONTH_NAMES[selectedMonth]} {selectedYear}
        </span>
      }
      onEdit={canEdit ? handleStartEdit : undefined}
      onSave={hasDirty ? handleSaveAll : undefined}
      onCancel={handleCancelEdit}
      saving={savingAll}
      onDelete={canEdit && !isEditing ? () => handleDeleteMonth(selectedYear, selectedMonth) : undefined}
      deleteConfirm
      onClose={isMobile ? () => setIsDrawerOpen(false) : undefined}
      cardClassName="max-w-none"
      headerActions={
        isEditing && canEdit ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setShowAddEmployee(true)}
            aria-label="Додати співробітника"
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <UserPlus aria-hidden="true" className="h-4 w-4" />
          </Button>
        ) : undefined
      }
    >
      <MiniCalendarGrid
        year={selectedYear}
        month={selectedMonth}
        days={effectiveTemplate}
        onDayClick={isEditing ? handleTemplateToggle : undefined}
      />

      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <span>Робочих днів: <strong className="text-emerald-700">{effectiveWorkDays}</strong></span>
        <span>Годин: <strong className="text-emerald-700">{effectiveWorkHours}</strong></span>
        {hasDirtyTemplate && (
          <span className="text-amber-600 text-xs font-medium">(змінено)</span>
        )}
      </div>

      {loadingTimesheets ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : (
        <TimesheetGrid
          monthData={selectedMonthData}
          timesheets={timesheets}
          year={selectedYear}
          month={selectedMonth}
          canEdit={canEdit}
          isEditing={isEditing}
          dirtyRows={dirtyRows}
          onCellChange={handleCellChange}
          onSaveRow={handleSaveRow}
          onRemoveEmployee={handleRemoveEmployee}
          savingRows={savingRows}
        />
      )}

      {timesheets.length > 0 && (
        <div className="mt-2 px-3 py-2.5 rounded-lg bg-slate-50/80 flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-4">
            <span>Співробітників: <strong>{timesheets.length}</strong></span>
            <span>
              Усього годин: <strong className="text-emerald-700">{timesheets.reduce((s, t) => s + t.work_hours, 0)}</strong>
            </span>
          </div>
          {hasDirtyRows && (
            <span className="text-amber-600 font-medium">
              Незбережених рядків: {dirtyRows.size}
            </span>
          )}
        </div>
      )}
    </GradientDetailCard>
  ) : null;

  const rightPanel = isCreateMode
    ? createPanel
    : detailPanel ?? (
        <ReferenceDetailsEmptyState
          icon={<CalendarDays className="h-16 w-16" aria-hidden="true" />}
          title="Оберіть місяць"
          description="Натисніть на місяць у списку зліва для перегляду табеля"
        />
      );

  return (
    <>
      <TwoPanelLayout
        leftPanel={
          <CalendarLeftPanel
            tabsSlot={tabsSlot}
            loading={allYearsLoading}
            error={error}
            years={years}
            currentYear={currentYear}
            monthsByYear={monthsByYear}
            expandedYears={expandedYears}
            isCreateMode={isCreateMode}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            totalMonths={totalMonths}
            canEdit={canEdit}
            onToggleYear={toggleYear}
            onStartCreate={handleStartCreate}
            onSelectMonth={handleSelectMonth}
          />
        }
        rightPanel={rightPanel}
        isDrawerOpen={isDrawerOpen}
        onDrawerClose={() => setIsDrawerOpen(false)}
      />

      <AddEmployeeModal
        isOpen={showAddEmployee}
        onClose={() => setShowAddEmployee(false)}
        employees={allEmployees}
        existingUserIds={existingUserIds}
        onSubmit={handleAddEmployees}
      />
    </>
  );
}
