'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Palmtree, X, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { useApproveAbsence, useDeleteAbsence } from '@/hooks/useAbsences';
import type { AbsenceType, TeamAbsenceInfo } from '@/lib/ops/cabinet/absences';
import VacationCreateView from './VacationCreateView';

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const TYPE_LABELS: Record<AbsenceType, string> = { '14d': '14д', '10d': '10д', '5d': '5д' };

interface VacationMonthPopoverProps {
  year: number;
  month: number; // 0-based
  approvedDays: number[];
  pendingDays: number[];
  isOwnRow: boolean;
  absences: TeamAbsenceInfo[];
  isManager: boolean;
  onClose: () => void;
  anchorRect: DOMRect | null;
}

export default function VacationMonthPopover({
  year, month, approvedDays, pendingDays, isOwnRow,
  absences, isManager, onClose, anchorRect,
}: VacationMonthPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const hasVacation = approvedDays.length > 0 || pendingDays.length > 0;
  const isCreateMode = isOwnRow && !hasVacation;

  useEffect(() => {
    function h(e: Event) { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); }
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [onClose]);

  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  const style = useMemo<React.CSSProperties>(() => {
    if (!anchorRect) return { position: 'absolute', top: 0, left: 0 };
    return { position: 'fixed', top: anchorRect.bottom + 4, left: Math.max(8, anchorRect.left - 80), zIndex: 50 };
  }, [anchorRect]);

  const monthName = new Date(year, month).toLocaleDateString('uk-UA', { month: 'long' });

  return (
    <div ref={ref} style={style} className="bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-slate-700 capitalize">{monthName} {year}</h4>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-slate-100 text-slate-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {isCreateMode ? (
        <VacationCreateView year={year} month={month} onClose={onClose} />
      ) : (
        <CalendarView
          year={year} month={month} approvedDays={approvedDays} pendingDays={pendingDays}
          absences={absences} isOwnRow={isOwnRow} isManager={isManager} onClose={onClose}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View mode — calendar with palm icons + approve/reject/delete
// ---------------------------------------------------------------------------

function CalendarView({
  year, month, approvedDays, pendingDays, absences, isOwnRow, isManager, onClose,
}: {
  year: number; month: number; approvedDays: number[]; pendingDays: number[];
  absences: TeamAbsenceInfo[]; isOwnRow: boolean; isManager: boolean; onClose: () => void;
}) {
  const approvedSet = useMemo(() => new Set(approvedDays), [approvedDays]);
  const pendingSet = useMemo(() => new Set(pendingDays), [pendingDays]);
  const approveMut = useApproveAbsence();
  const deleteMut = useDeleteAbsence();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const monthAbsences = useMemo(() => absences.filter(a => {
    const s = new Date(a.startDate), e = new Date(a.endDate);
    return s <= new Date(year, month + 1, 0) && e >= new Date(year, month, 1);
  }), [absences, year, month]);

  const pendingAbsences = monthAbsences.filter(a => a.status === 'pending' && !a.locked);
  const ownAbsences = monthAbsences; // all own absences (pending + approved) can be deleted
  const canApprove = isManager && !isOwnRow && pendingAbsences.length > 0;
  const canDelete = isOwnRow && ownAbsences.length > 0;
  const isBusy = approveMut.isPending || deleteMut.isPending;

  const weeks = useMemo(() => {
    const dim = new Date(year, month + 1, 0).getDate();
    const fd = new Date(year, month, 1).getDay();
    const off = fd === 0 ? 6 : fd - 1;
    const res: (number | null)[][] = [];
    let w: (number | null)[] = Array(off).fill(null);
    for (let d = 1; d <= dim; d++) { w.push(d); if (w.length === 7) { res.push(w); w = []; } }
    if (w.length) { while (w.length < 7) w.push(null); res.push(w); }
    return res;
  }, [year, month]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px]">
        {WEEKDAY_SHORT.map(d => <div key={d} className="font-semibold text-slate-400 py-0.5">{d}</div>)}
        {weeks.flat().map((day, i) => {
          if (day == null) return <div key={`e-${i}`} />;
          const isA = approvedSet.has(day), isP = pendingSet.has(day);
          const isWe = [0, 6].includes(new Date(year, month, day).getDay());
          return (
            <div key={day} className={cn(
              'relative rounded-md py-1 font-medium',
              isA && 'bg-sky-100 text-sky-700', isP && 'bg-sky-50 text-sky-500 border border-dashed border-sky-300',
              !isA && !isP && isWe && 'text-slate-300', !isA && !isP && !isWe && 'text-slate-600',
            )}>
              {day}
              {(isA || isP) && <Palmtree className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 text-emerald-500" />}
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-100" /> затверджено</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-50 border border-dashed border-sky-300" /> очікує</span>
      </div>

      {/* Manager: approve/reject pending absences of others */}
      {canApprove && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
          {pendingAbsences.map(a => (
            <div key={a.id} className="rounded-lg bg-slate-50 px-2.5 py-2">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="font-medium text-slate-600">{TYPE_LABELS[a.absenceType]} &middot; {fmtRange(a.startDate, a.endDate)}</span>
                <span className="text-amber-500 font-medium">очікує</span>
              </div>
              {rejectingId !== a.id ? (
                <div className="flex gap-1.5">
                  <button onClick={() => approveMut.mutate({ absenceId: a.id, action: 'approve', year }, { onSuccess: onClose })}
                    disabled={isBusy} className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500 text-white text-[11px] font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50">
                    <Check className="h-3 w-3" /> Затвердити
                  </button>
                  <button onClick={() => { setRejectingId(a.id); setRejectReason(''); }}
                    disabled={isBusy} className="flex items-center gap-1 px-2 py-1 rounded-md text-slate-500 text-[11px] font-medium hover:bg-slate-100 transition-colors disabled:opacity-50">
                    <X className="h-3 w-3" /> Відхилити
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <input type="text" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="Причина відхилення" autoFocus
                    className="w-full text-[11px] border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
                  <div className="flex gap-1.5">
                    <button onClick={() => { if (rejectReason.trim()) approveMut.mutate({ absenceId: a.id, action: 'reject', reason: rejectReason.trim(), year }, { onSuccess: onClose }); }}
                      disabled={isBusy || !rejectReason.trim()} className="px-2 py-1 rounded-md bg-red-500 text-white text-[11px] font-medium hover:bg-red-600 transition-colors disabled:opacity-50">
                      Відхилити
                    </button>
                    <button onClick={() => setRejectingId(null)}
                      className="px-2 py-1 rounded-md text-slate-500 text-[11px] font-medium hover:bg-slate-100 transition-colors">
                      Скасувати
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Own row: delete any absence (pending or approved), but not locked */}
      {canDelete && (
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-1.5">
          {ownAbsences.map(a => (
            <div key={a.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
              <span className="text-[11px] font-medium text-slate-600">
                {TYPE_LABELS[a.absenceType]} &middot; {fmtRange(a.startDate, a.endDate)}
                <span className={a.status === 'approved' ? ' text-emerald-500 ml-1' : ' text-amber-500 ml-1'}>
                  {a.status === 'approved' ? '✓' : '⏳'}
                </span>
                {a.locked && <span className="text-slate-400 ml-1">🔒</span>}
              </span>
              {!a.locked ? (
                <button onClick={() => deleteMut.mutate({ id: a.id, year }, { onSuccess: onClose })}
                  disabled={isBusy} className="flex items-center gap-1 px-2 py-1 rounded-md text-red-500 text-[11px] font-medium hover:bg-red-50 transition-colors disabled:opacity-50">
                  <Trash2 className="h-3 w-3" /> Скасувати
                </button>
              ) : (
                <span className="text-[10px] text-slate-400">в табелі</span>
              )}
            </div>
          ))}
        </div>
      )}

      {(approveMut.isError || deleteMut.isError) && (
        <p className="mt-1 text-[10px] text-red-500">{(approveMut.error || deleteMut.error)?.message}</p>
      )}
    </div>
  );
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start), e = new Date(end);
  const sm = s.toLocaleDateString('uk-UA', { month: 'short' }).replace('.', '');
  const em = e.toLocaleDateString('uk-UA', { month: 'short' }).replace('.', '');
  if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${sm}`;
  return `${s.getDate()} ${sm} – ${e.getDate()} ${em}`;
}
