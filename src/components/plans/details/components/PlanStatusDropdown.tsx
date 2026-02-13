'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getPlanStatusText, PlanStatus, PLAN_STATUSES, getPlanStatusColor, PlanStatusInfo } from '@/types/planning';

interface PlanStatusDropdownProps {
  status: PlanStatus;
  onStatusChange?: (status: PlanStatus) => void;
  canChange: boolean;
  availableStatuses?: PlanStatusInfo[];
}

const getStatusTailwindColor = (status: PlanStatus) => {
  const color = getPlanStatusColor(status);
  switch (color) {
    case 'violet': return 'purple';
    case 'emerald': return 'emerald';
    case 'green': return 'green';
    case 'blue': return 'blue';
    case 'red': return 'red';
    case 'amber': return 'amber';
    default: return 'gray';
  }
};

export default function PlanStatusDropdown({
  status,
  onStatusChange,
  canChange,
  availableStatuses,
}: PlanStatusDropdownProps) {
  const statusesToShow = availableStatuses || PLAN_STATUSES;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const canOpen = canChange && !!onStatusChange;

  const handleStatusSelect = (newStatus: PlanStatus) => {
    if (onStatusChange && newStatus !== status) {
      onStatusChange(newStatus);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div
        className={cn(
          'flex items-center',
          canOpen ? 'cursor-pointer group' : 'opacity-90'
        )}
        onClick={() => canOpen && setIsOpen(!isOpen)}
      >
        <Badge className={cn(
          'bg-white text-slate-900 border-white font-semibold text-xs px-2.5 py-1 rounded-full shadow-md whitespace-nowrap transition-colors flex items-center gap-1.5',
          canOpen && 'group-hover:bg-slate-50 pr-2 translate-y-0 active:translate-y-0.5'
        )}>
          <div className={cn('w-1.5 h-1.5 rounded-full', `bg-${getStatusTailwindColor(status)}-500`)} />
          {getPlanStatusText(status)}
          {canOpen && <ChevronDown className="ml-1 h-3 w-3 text-slate-500" aria-hidden="true" />}
        </Badge>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-48 bg-white/95 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-200 py-2 z-[100] animate-scale backdrop-blur-xl">
          <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 mb-2">Выберите статус</div>
          {statusesToShow.map((s) => {
            const tailwindColor = getStatusTailwindColor(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => handleStatusSelect(s.value)}
                className={cn(
                  'w-full text-left px-4 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors',
                  status === s.value ? 'text-indigo-600 bg-indigo-50/50 font-semibold' : 'text-slate-600'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-2.5 h-2.5 rounded-full shadow-sm', `bg-${tailwindColor}-500`)} />
                  {s.label}
                </div>
                {status === s.value && <Check className="h-3 w-3 text-indigo-600" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
