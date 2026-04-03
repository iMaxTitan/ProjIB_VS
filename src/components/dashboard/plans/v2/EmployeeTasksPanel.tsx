'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import type { DailyTask, MonthlyPlan, MonthlyPlanAssignee } from '@/types/planning';
import type { ProcessNode, PlanNode, ViewLevel } from '@/hooks/usePlansV2';
import EmptyState from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Users, ChevronRight } from 'lucide-react';
import { SummaryBox, pctColor, SourceBadge, UserAvatar, getInitials } from '@/components/dashboard/shared';
import { usePlanAssignees } from '@/hooks/usePlanRelations';
import { usePlansV2Ctx } from './PlansV2Context';

interface EmployeeTasksPanelProps {
  selectedProcess: ProcessNode | null;
  selectedProcedure: PlanNode | null;
  detailPlans: MonthlyPlan[];
  dailyTasks: DailyTask[];
  tasksLoading: boolean;
  assignees: MonthlyPlanAssignee[];
  assigneesLoading: boolean;
  scopeLabel: string;
  scopeMonths: number[];
  month: number | null;
  resourceHours: number;
  viewLevel?: ViewLevel;
}

// ── Types for grouped data ──────────────────────────────────

interface ProcedureHours {
  procedureName: string;
  hours: number;
}

interface TaskGroup {
  title: string;
  description?: string;
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
  viewLevel,
}: EmployeeTasksPanelProps) {
  const { canEdit, onRefresh, user } = usePlansV2Ctx();
  // Editing: month + procedure + pending
  const isMonth = viewLevel === 'month';
  const monthlyPlan = isMonth && selectedProcedure ? selectedProcedure.plans[0] : null;
  const monthlyPlanId = monthlyPlan?.monthly_plan_id ?? null;
  const editing = isMonth && !!canEdit && monthlyPlan?.status === 'pending';
  const canEditAssignees = isMonth && !!canEdit && !!monthlyPlan;
  const departmentId = selectedProcess?.departmentId;

  // Assignees hook — assignees can be edited in any plan status
  const { deptEmployees, toggleAssignee: toggleAssigneeFn } = usePlanAssignees(monthlyPlanId, departmentId, canEditAssignees, user.role ?? undefined, user.user_id ?? undefined);
  const toggleAssignee = React.useCallback(async (userId: string, assigned: boolean) => {
    await toggleAssigneeFn(userId, assigned);
    onRefresh?.();
  }, [toggleAssigneeFn, onRefresh]);

  // Build planId → planName map (procedures from tree + initiatives from plan_name)
  const planNameMap = React.useMemo(() => {
    const m = new Map<string, { planId: string; planName: string }>();
    if (!selectedProcess) return m;
    for (const plan of detailPlans) {
      if (plan.procedure_id) {
        const proc = selectedProcess.procedures.find(p => p.procedureId === plan.procedure_id);
        if (proc) m.set(plan.monthly_plan_id, { planId: proc.procedureId, planName: proc.name });
      } else if (plan.initiative_id && plan.plan_name) {
        m.set(plan.monthly_plan_id, { planId: plan.initiative_id, planName: plan.plan_name });
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
      taskMap: Map<string, { description?: string; hours: number; count: number; source?: string }>;
    }>();

    for (const t of dailyTasks) {
      let emp = map.get(t.user_id);
      if (!emp) {
        const name = t.user_name || t.user_email || 'Невідомий';
        emp = {
          userId: t.user_id, name, photo: t.user_photo,
          initials: getInitials(name), totalHours: 0,
          procMap: new Map(), taskMap: new Map<string, { description?: string; hours: number; count: number; source?: string }>(),
        };
        map.set(t.user_id, emp);
      }
      const hours = t.spent_hours || 0;
      emp.totalHours += hours;

      // Per-plan accumulation (for process view)
      const planInfo = planNameMap.get(t.monthly_plan_id);
      if (planInfo) {
        const existing = emp.procMap.get(planInfo.planId);
        if (existing) existing.hours += hours;
        else emp.procMap.set(planInfo.planId, { name: planInfo.planName, hours });
      }

      // Group tasks by title (for procedure view)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tAny = t as any;
      const title = (tAny.title as string) || 'Без назви';
      const source = tAny.source as string | undefined;
      const groupKey = `${title}::${source || ''}`;
      const existing = emp.taskMap.get(groupKey);
      if (existing) { existing.hours += hours; existing.count += 1; }
      else emp.taskMap.set(groupKey, { description: t.description || undefined, hours, count: 1, source });
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
          .map(([key, g]) => ({ title: key.split('::')[0], description: g.description, hours: Math.round(g.hours * 10) / 10, count: g.count, source: g.source })),
      }));
  }, [dailyTasks, planNameMap]);

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
      </div>
      <div className="hdr-sep" />

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {canEditAssignees ? (() => {
          if (deptEmployees.length === 0) return (
            <div className="flex items-center justify-center py-12"><Spinner size="md" /></div>
          );
          const assignedIds = new Set(assignees.map(a => a.user_id));
          const usersWithTasks = new Set(dailyTasks.map(t => t.user_id));
          return (
            <div className="py-1">
              {deptEmployees.map((emp, idx) => {
                const assigned = assignedIds.has(emp.id);
                const hasTasks = assigned && usersWithTasks.has(emp.id);
                return (
                  <button key={emp.id} type="button"
                    onClick={() => {
                      if (assigned && hasTasks) return;
                      toggleAssignee(emp.id, assigned);
                    }}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-2.5 transition-colors text-left border-b border-slate-100/80 last:border-b-0',
                      'hover:bg-slate-50/60',
                      assigned && hasTasks && 'cursor-not-allowed',
                    )}>
                    <UserAvatar name={emp.name} initials={getInitials(emp.name)} idx={idx} />
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-xs font-semibold truncate text-slate-800', !assigned && 'line-through')}>
                        {emp.name}
                      </div>
                      {assigned && hasTasks && <div className="text-[9px] text-amber-500">має задачі</div>}
                    </div>
                    {assigned && <span className="text-[9px] font-semibold text-emerald-500 flex-shrink-0">✓</span>}
                  </button>
                );
              })}
            </div>
          );
        })() : (tasksLoading || assigneesLoading) ? (
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
                <UserAvatar name={emp.name} photo={emp.photo} initials={emp.initials} idx={empIdx} />
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
                  className="flex items-start gap-2 px-4 py-1.5 pl-9 border-t border-slate-100/80 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-700 truncate">{tg.title}</div>
                    {tg.description && (
                      <div className="text-[10px] text-slate-500 line-clamp-2">{tg.description}</div>
                    )}
                  </div>
                  <SourceBadge source={tg.source} />
                  <span className="text-[11px] font-bold text-slate-700 min-w-[32px] text-right">
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
                <UserAvatar
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

