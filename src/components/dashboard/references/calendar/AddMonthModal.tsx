'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { TimesheetCode } from '@/types/calendar';
import { generateMonthTemplate, calcWorkHours, calcWorkingDays } from '@/lib/ops/working-days';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { MiniCalendarGrid } from './MiniCalendarGrid';

const MONTH_NAMES = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

interface AddMonthModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  existingMonths: number[];
  onSubmit: (month: number, dayTypes: TimesheetCode[]) => Promise<void>;
}

export function AddMonthModal({
  isOpen,
  onClose,
  year,
  existingMonths,
  onSubmit,
}: AddMonthModalProps) {
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [template, setTemplate] = useState<TimesheetCode[]>([]);
  const [saving, setSaving] = useState(false);

  const availableMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 1).filter(
      (m) => !existingMonths.includes(m),
    );
  }, [existingMonths]);

  const handleMonthChange = useCallback(
    (m: number) => {
      setSelectedMonth(m);
      setTemplate(generateMonthTemplate(year, m));
    },
    [year],
  );

  // Auto-select first available
  useEffect(() => {
    if (isOpen && availableMonths.length > 0 && selectedMonth === 0) {
      handleMonthChange(availableMonths[0]);
    }
  }, [isOpen, availableMonths, selectedMonth, handleMonthChange]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setSelectedMonth(0);
      setTemplate([]);
    }
  }, [isOpen]);

  const toggleHoliday = useCallback((_dayIndex: number, currentCode: TimesheetCode) => {
    setTemplate((prev) => {
      const next = [...prev];
      if (currentCode === '8') next[_dayIndex] = 'С';
      else if (currentCode === 'С') next[_dayIndex] = '8';
      return next;
    });
  }, []);

  const workDays = useMemo(() => calcWorkingDays(template), [template]);

  const handleSubmit = useCallback(async () => {
    if (!selectedMonth || saving) return;
    setSaving(true);
    try {
      await onSubmit(selectedMonth, template);
      onClose();
    } finally {
      setSaving(false);
    }
  }, [selectedMonth, template, saving, onSubmit, onClose]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Добавить месяц — ${year}`}>
      <div className="space-y-4">
        {/* Month select */}
        <div>
          <label htmlFor="month-select" className="block text-sm font-medium text-slate-700 mb-1">
            Месяц
          </label>
          <select
            id="month-select"
            value={selectedMonth}
            onChange={(e) => handleMonthChange(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus-ring"
            aria-label="Выбор месяца"
          >
            <option value={0} disabled>Выберите месяц</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{MONTH_NAMES[m]}</option>
            ))}
          </select>
        </div>

        {/* Mini calendar */}
        {selectedMonth > 0 && template.length > 0 && (
          <>
            <MiniCalendarGrid
              year={year}
              month={selectedMonth}
              days={template}
              onDayClick={toggleHoliday}
              hint="Нажмите на рабочий день, чтобы отметить праздник (С)"
            />
            <p className="text-sm text-slate-600">
              Рабочих дней: <strong>{workDays}</strong> ({calcWorkHours(template)} ч)
            </p>
          </>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} aria-label="Отмена">
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedMonth || saving}
            aria-label="Создать месяц"
          >
            {saving ? <Spinner className="h-4 w-4" /> : 'Создать'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
