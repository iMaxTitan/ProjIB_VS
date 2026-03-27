'use client';

import React, { useState, useMemo } from 'react';
import { ClipboardCheck, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/Button';
import { MiniCalendarGrid } from '@/components/dashboard/references/calendar/MiniCalendarGrid';
import { useAbsences, useApproveAbsence } from '@/hooks/useAbsences';
import { MONTH_NAMES_UK } from '@/types/planning';
import type { TimesheetCode } from '@/types/calendar';
import type { AbsenceRow, AbsenceType } from '@/lib/ops/cabinet/absences';

const TYPE_LABELS: Record<AbsenceType, string> = { '14d': '14д', '10d': '10д', '5d': '5д' };

export default function CabinetApprovals() {
  const year = new Date().getFullYear();
  const { data, isLoading } = useAbsences(year);
  const approveMut = useApproveAbsence();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const pending = data?.pending || [];

  if (isLoading || pending.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck className="h-5 w-5 text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-800">Заявки на відпустку</h3>
        <Badge variant="indigo" size="sm">{pending.length}</Badge>
      </div>

      <div className="space-y-2">
        {pending.map(absence => (
          <ApprovalCard
            key={absence.id}
            absence={absence}
            year={year}
            isExpanded={expandedId === absence.id}
            onToggle={() => setExpandedId(prev => prev === absence.id ? null : absence.id)}
            isRejecting={rejectingId === absence.id}
            rejectReason={rejectReason}
            onStartReject={() => { setRejectingId(absence.id); setRejectReason(''); }}
            onCancelReject={() => setRejectingId(null)}
            onRejectReasonChange={setRejectReason}
            onApprove={() => {
              approveMut.mutate(
                { absenceId: absence.id, action: 'approve', year },
                { onSuccess: () => setExpandedId(null) },
              );
            }}
            onReject={() => {
              if (!rejectReason.trim()) return;
              approveMut.mutate(
                { absenceId: absence.id, action: 'reject', reason: rejectReason.trim(), year },
                { onSuccess: () => { setRejectingId(null); setExpandedId(null); } },
              );
            }}
            isPending={approveMut.isPending}
          />
        ))}
      </div>

      {approveMut.isError && (
        <p className="text-xs text-red-600 mt-2">{(approveMut.error as Error).message}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

interface ApprovalCardProps {
  absence: AbsenceRow;
  year: number;
  isExpanded: boolean;
  onToggle: () => void;
  isRejecting: boolean;
  rejectReason: string;
  onStartReject: () => void;
  onCancelReject: () => void;
  onRejectReasonChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
}

function ApprovalCard({
  absence,
  year,
  isExpanded,
  onToggle,
  isRejecting,
  rejectReason,
  onStartReject,
  onCancelReject,
  onRejectReasonChange,
  onApprove,
  onReject,
  isPending,
}: ApprovalCardProps) {
  const calendarDays = useMemo((): TimesheetCode[] => {
    const daysInMonth = new Date(year, absence.month, 0).getDate();
    const days: TimesheetCode[] = [];

    // If we have start_date/end_date, compute range for this month
    const start = absence.start_date ? new Date(absence.start_date) : null;
    const end = absence.end_date ? new Date(absence.end_date) : null;

    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, absence.month - 1, d).getDay();
      let inRange = false;

      if (start && end) {
        const date = new Date(year, absence.month - 1, d);
        inRange = date >= start && date <= end;
      } else {
        inRange = absence.days.includes(d);
      }

      if (dow === 0 || dow === 6) {
        days.push(inRange ? 'О' : 'В');
      } else if (inRange) {
        days.push('О');
      } else {
        days.push('8');
      }
    }
    return days;
  }, [absence, year]);

  const typeLabel = TYPE_LABELS[absence.absence_type] || '';
  const dateRange = absence.start_date && absence.end_date
    ? formatRange(absence.start_date, absence.end_date)
    : `${MONTH_NAMES_UK[absence.month - 1].slice(0, 3)}, ${absence.days.length}д`;

  return (
    <div className="border border-slate-200 rounded-lg">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-50 transition-colors rounded-lg"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-slate-700 truncate">
            {absence.full_name}
          </span>
          {typeLabel && <Badge variant="indigo" size="sm">{typeLabel}</Badge>}
          <Badge variant="sky" size="sm">{dateRange}</Badge>
        </div>
        {isExpanded
          ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
        }
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
          <MiniCalendarGrid year={year} month={absence.month} days={calendarDays} />

          {absence.comment && (
            <p className="text-xs text-slate-500">
              Коментар: {absence.comment}
            </p>
          )}

          {isRejecting ? (
            <div className="space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={e => onRejectReasonChange(e.target.value)}
                placeholder="Причина відхилення"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                autoFocus
              />
              <div className="flex gap-2">
                <Button size="xs" variant="destructive" onClick={onReject} disabled={isPending || !rejectReason.trim()}>
                  Відхилити
                </Button>
                <Button size="xs" variant="ghost" onClick={onCancelReject}>
                  Скасувати
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="xs" variant="success" onClick={onApprove} disabled={isPending}>
                <Check className="h-3.5 w-3.5 mr-1" />
                Затвердити
              </Button>
              <Button size="xs" variant="ghost" onClick={onStartReject} disabled={isPending}>
                <X className="h-3.5 w-3.5 mr-1" />
                Відхилити
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sDay = s.getDate();
  const eDay = e.getDate();
  const sMonth = MONTH_NAMES_UK[s.getMonth()].slice(0, 3).toLowerCase();
  const eMonth = MONTH_NAMES_UK[e.getMonth()].slice(0, 3).toLowerCase();

  if (s.getMonth() === e.getMonth()) return `${sDay}–${eDay} ${sMonth}`;
  return `${sDay} ${sMonth} – ${eDay} ${eMonth}`;
}
