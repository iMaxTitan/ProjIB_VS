'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import type { DailyTask, MonthlyPlan, MonthlyPlanAssignee } from '@/types/planning';
import Image from 'next/image';
import type { ProcessNode, ProcedureNode } from '@/hooks/usePlansV2';
import EmptyState from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Users, ChevronRight } from 'lucide-react';

interface EmployeeTasksPanelProps {
  selectedProcess: ProcessNode | null;
  selectedProcedure: ProcedureNode | null;
  detailPlans: MonthlyPlan[];
  dailyTasks: DailyTask[];
  tasksLoading: boolean;
  assignees: MonthlyPlanAssignee[];
  assigneesLoading: boolean;
  scopeLabel: string;
  scopeMonths: number[];
  month: number | null;
  resourceHours: number;
}

function pctColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-600';
  if (pct >= 40) return 'text-indigo-600';
  return 'text-amber-600';
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0] || '').slice(0, 2).join('').toUpperCase();
}

const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-purple-500', 'bg-cyan-500',
  'bg-emerald-500', 'bg-amber-500', 'bg-blue-500',
  'bg-rose-500', 'bg-teal-500',
];

function avatarColor(idx: number): string {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

// ── Types for grouped data ──────────────────────────────────

interface ProcedureHours {
  procedureName: string;
  hours: number;
}

interface TaskGroup {
  description: string;
  hours: number;
  count: number;
  source?: string;
}

interface EmployeeRow {
  userId: string;
  name: string;
  photo?: string;
  initials: string;
  totalHours: number;
  procedures: ProcedureHours[]; // when process selected
  taskGroups: TaskGroup[];      // when procedure selected
}

// ── Component ───────────────────────────────────────────────

export default function EmployeeTasksPanel({
  selectedProcess,
  selectedProcedure,
  detailPlans,
  dailyTasks,
  tasksLoading,
  assignees,
  assigneesLoading,
  scopeLabel,
  resourceHours,
}: EmployeeTasksPanelProps) {
  // Build planId → procedureId + procedureName map
  const planProcMap = React.useMemo(() => {
    const m = new Map<string, { procedureId: string; procedureName: string }>();
    if (!selectedProcess) return m;
    for (const plan of detailPlans) {
      const proc = selectedProcess.procedures.find(p => p.procedureId === plan.procedure_id);
      if (proc) {
        m.set(plan.monthly_plan_id, { procedureId: proc.procedureId, procedureName: proc.name });
      }
    }
    return m;
  }, [detailPlans, selectedProcess]);

  // Group tasks by employee, with per-procedure and per-task-description breakdown
  const employees: EmployeeRow[] = React.useMemo(() => {
    if (dailyTasks.length === 0) return [];
    const map = new Map<string, {
      userId: string; name: string; photo?: string; initials: string;
      totalHours: number;
      procMap: Map<string, { name: string; hours: number }>;
      taskMap: Map<string, { hours: number; count: number; source?: string }>;
    }>();

    for (const t of dailyTasks) {
      let emp = map.get(t.user_id);
      if (!emp) {
        const name = t.user_name || t.user_email || 'Невідомий';
        emp = {
          userId: t.user_id, name, photo: t.user_photo,
          initials: getInitials(name), totalHours: 0,
          procMap: new Map(), taskMap: new Map(),
        };
        map.set(t.user_id, emp);
      }
      const hours = t.spent_hours || 0;
      emp.totalHours += hours;

      // Per-procedure accumulation (for process view)
      const procInfo = planProcMap.get(t.monthly_plan_id);
      if (procInfo) {
        const existing = emp.procMap.get(procInfo.procedureId);
        if (existing) existing.hours += hours;
        else emp.procMap.set(procInfo.procedureId, { name: procInfo.procedureName, hours });
      }

      // Per-task-title accumulation (for procedure view)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tAny = t as any;
      const desc = tAny.title as string || t.description || 'Без назви';
      const source = tAny.source as string | undefined;
      const tg = emp.taskMap.get(desc);
      if (tg) { tg.hours += hours; tg.count += 1; }
      else emp.taskMap.set(desc, { hours, count: 1, source });
    }

    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
      .map(e => ({
        userId: e.userId, name: e.name, photo: e.photo, initials: e.initials,
        totalHours: Math.round(e.totalHours * 10) / 10,
        procedures: Array.from(e.procMap.values())
          .sort((a, b) => b.hours - a.hours)
          .map(p => ({ procedureName: p.name, hours: Math.round(p.hours * 10) / 10 })),
        taskGroups: Array.from(e.taskMap.entries())
          .sort((a, b) => b[1].hours - a[1].hours)
          .map(([desc, g]) => ({ description: desc, hours: Math.round(g.hours * 10) / 10, count: g.count, source: g.source })),
      }));
  }, [dailyTasks, planProcMap]);

  const showProcessBreakdown = !selectedProcedure && !!selectedProcess;
  const hasData = employees.length > 0;

  // Collapsed state per employee
  const [expandedUsers, setExpandedUsers] = React.useState<Set<string>>(new Set());
  const toggleUser = React.useCallback((userId: string) => {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  if (!selectedProcess) {
    return (
      <EmptyState
        variant="centered"
        icon={<Users className="h-10 w-10" />}
        title="Виконавці"
        description="Оберіть процес або процедуру для перегляду виконавців"
      />
    );
  }

  const totalPlanned = selectedProcedure?.plannedHours ?? selectedProcess.totalPlanned;
  const totalSpent = selectedProcedure?.spentHours ?? selectedProcess.totalSpent;
  const totalPct = totalPlanned > 0 ? Math.round((totalSpent / totalPlanned) * 100) : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-purple-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-700 flex-1 min-w-0">Виконавці</span>
        <span className="text-[10px] text-slate-400 flex-shrink-0">{scopeLabel}</span>
      </div>
      <div className="hdr-sep" />

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tasksLoading || assigneesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" />
          </div>
        ) : hasData ? (
          employees.map((emp, empIdx) => {
            const isExpanded = expandedUsers.has(emp.userId);
            return (
            <div key={emp.userId} className="border-b border-slate-100 last:border-b-0">
              {/* Employee header — clickable */}
              <button
                type="button"
                onClick={() => toggleUser(emp.userId)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 bg-slate-50/80 hover:bg-slate-100/80 transition-colors cursor-pointer text-left"
              >
                <ChevronRight className={cn('w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                <Avatar name={emp.name} photo={emp.photo} initials={emp.initials} idx={empIdx} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">{emp.name}</div>
                </div>
                <span className="text-xs font-bold text-slate-700">{emp.totalHours} год</span>
              </button>

              {/* Per-procedure breakdown (when process selected) */}
              {isExpanded && showProcessBreakdown && emp.procedures.map((pr, prIdx) => (
                <div
                  key={prIdx}
                  className="flex items-center gap-2 px-4 py-1.5 pl-9 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-600 truncate">{pr.procedureName}</div>
                  </div>
                  <span className="text-[11px] font-bold text-slate-700 min-w-[40px] text-right">
                    {pr.hours} год
                  </span>
                </div>
              ))}

              {/* Per-task breakdown (when procedure selected) */}
              {isExpanded && !showProcessBreakdown && emp.taskGroups.map((tg, tgIdx) => (
                <div
                  key={tgIdx}
                  className="flex items-center gap-2 px-4 py-1.5 pl-9 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-600 truncate">{tg.description}</div>
                  </div>
                  <SourceBadge source={tg.source} />
                  {tg.count > 1 && (
                    <span className="text-[9px] text-slate-400 flex-shrink-0">×{tg.count}</span>
                  )}
                  <span className="text-[11px] font-bold text-slate-700 min-w-[40px] text-right">
                    {tg.hours} год
                  </span>
                </div>
              ))}
            </div>
          );})
        ) : assignees.length > 0 ? (
          /* Fallback: show assignees without hours */
          <div className="py-1">
            {assignees.map((a, idx) => (
              <div
                key={a.user_id}
                className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-slate-50/50 transition-colors border-b border-slate-100/80 last:border-b-0"
              >
                <Avatar
                  name={a.full_name || a.email || '??'}
                  photo={a.photo_url}
                  initials={getInitials(a.full_name || a.email || '??')}
                  idx={idx}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-800 truncate">
                    {a.full_name || a.email || 'Невідомий'}
                  </div>
                </div>
                {a.role && (
                  <span className="text-[9px] font-semibold text-slate-400 uppercase flex-shrink-0">
                    {a.role}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            variant="inline"
            title="Немає даних"
            description="За обраний період не знайдено задач"
          />
        )}
      </div>

      {/* Summary footer */}
      <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
        <SummaryBox
          label="Виконавців"
          value={hasData ? String(employees.length) : assignees.length > 0 ? String(assignees.length) : '\u2014'}
        />
        <SummaryBox
          label="Виконано"
          value={`${totalSpent} год`}
          colorClass="text-emerald-600"
        />
        <SummaryBox
          label="Покриття"
          value={`${totalPct}%`}
          colorClass={pctColor(totalPct)}
        />
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function Avatar({ name, photo, initials, idx }: { name: string; photo?: string; initials: string; idx: number }) {
  if (photo) {
    return (
      <Image src={photo} alt={name} width={28} height={28}
        className="rounded-full flex-shrink-0 object-cover" unoptimized />
    );
  }
  return (
    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0', avatarColor(idx))}>
      {initials}
    </div>
  );
}

function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'self') return null;
  const label = source === 'chief' ? 'ШЕФ' : source === 'head' ? 'КЕР' : source === 'calendar' ? 'КАЛЕНДАР' : source.toUpperCase();
  const color = source === 'chief'
    ? 'bg-red-50 text-red-600 border-red-200/60'
    : source === 'head'
      ? 'bg-amber-50 text-amber-600 border-amber-200/60'
      : source === 'calendar'
        ? 'bg-blue-50 text-blue-600 border-blue-200/60'
        : 'bg-slate-100 text-slate-500 border-slate-200/60';
  return (
    <span className={cn('px-1.5 py-0.5 text-[9px] font-bold rounded border flex-shrink-0', color)}>
      {label}
    </span>
  );
}

function SummaryBox({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="px-2 py-1.5 rounded-lg bg-white border border-slate-200/60 text-center">
      <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
      <div className={cn('text-sm font-extrabold mt-0.5 leading-tight', colorClass || 'text-slate-800')}>{value}</div>
    </div>
  );
}
