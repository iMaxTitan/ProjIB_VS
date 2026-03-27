'use client';

import React, { useEffect, useRef } from 'react';
import { cn } from '@/lib/shared/utils';
import { TIMESHEET_CODES, MINI_CALENDAR_COLORS, EDITABLE_CODES, type TimesheetCode } from '@/types/calendar';

interface CellCodePickerProps {
  currentCode: TimesheetCode;
  isWeekendOrHoliday: boolean;
  onSelect: (code: TimesheetCode) => void;
  onClose: () => void;
}

export function CellCodePicker({
  currentCode,
  isWeekendOrHoliday,
  onSelect,
  onClose,
}: CellCodePickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: Event) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [onClose]);

  if (isWeekendOrHoliday) return null;

  return (
    <div
      ref={ref}
      className="absolute z-50 bg-white rounded-lg shadow-lg border border-slate-200 p-1.5 min-w-[120px]"
      role="listbox"
      aria-label="Выбор кода"
    >
      {EDITABLE_CODES.map((code) => {
        const meta = TIMESHEET_CODES[code];
        return (
          <button
            key={code}
            type="button"
            role="option"
            aria-selected={code === currentCode}
            onClick={() => {
              onSelect(code);
              onClose();
            }}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1 rounded text-xs text-left transition-colors',
              code === currentCode ? 'bg-indigo-50 font-semibold' : 'hover:bg-slate-50',
            )}
          >
            <span className={cn('w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold', MINI_CALENDAR_COLORS[code])}>
              {code}
            </span>
            <span>{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
