import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { MonthlyPlan, QuarterlyPlan, MONTH_NAMES_RU } from '@/types/planning';
import { UserInfo } from '@/types/azure';
import { HourDistributionType } from '@/types/infrastructure';
import { usePlanCopy } from '@/hooks/usePlanCopy';
import { getErrorMessage } from '@/lib/shared/utils/error-message';

interface AssigneeWithDetails {
  user_id: string;
  full_name: string;
}

interface PlanCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: MonthlyPlan;
  user: UserInfo;
  activeQuarterlyPlans: QuarterlyPlan[];
  sourceProcessId: string | null;
  sourceProcessName: string;
  editAssigneeIds: string[];
  assignees: AssigneeWithDetails[];
  editCompanyIds: string[];
  editProcedureId: string;
  distributionType: HourDistributionType;
  editProjectIds: string[];
  onSuccess: (newId: string) => void;
}

export default function PlanCopyModal({
  isOpen,
  onClose,
  plan,
  user,
  activeQuarterlyPlans,
  sourceProcessId,
  sourceProcessName,
  editAssigneeIds,
  assignees,
  editCompanyIds,
  editProcedureId,
  distributionType,
  editProjectIds,
  onSuccess,
}: PlanCopyModalProps) {
  const [copyQuarterlyId, setCopyQuarterlyId] = useState<string>('');
  const [copyTargetMonth, setCopyTargetMonth] = useState<number>(((plan.month % 12) || 0) + 1);
  const { copying, error: copyError, copyPlan, clearError } = usePlanCopy();

  const copyQuarterlyOptions = useMemo(() => {
    const sameProcess = activeQuarterlyPlans.filter(q => {
      if (sourceProcessId) return q.process_id === sourceProcessId;
      if (sourceProcessName) return (q.process_name || '').trim().toLowerCase() === sourceProcessName;
      return false;
    });
    return sameProcess.length > 0 ? sameProcess : activeQuarterlyPlans;
  }, [activeQuarterlyPlans, sourceProcessId, sourceProcessName]);

  const selectedCopyQuarterly = useMemo(
    () => copyQuarterlyOptions.find(q => q.quarterly_id === copyQuarterlyId) || null,
    [copyQuarterlyOptions, copyQuarterlyId]
  );

  const copyQuarterMonths = useMemo(() => {
    if (!selectedCopyQuarterly) return [];
    const startMonth = (selectedCopyQuarterly.quarter - 1) * 3 + 1;
    return [startMonth, startMonth + 1, startMonth + 2];
  }, [selectedCopyQuarterly]);

  useEffect(() => {
    if (!isOpen) return;
    const preferredQuarterlyId = (plan.quarterly_id && copyQuarterlyOptions.some(q => q.quarterly_id === plan.quarterly_id))
      ? plan.quarterly_id
      : copyQuarterlyOptions[0]?.quarterly_id || '';
    setCopyQuarterlyId(preferredQuarterlyId);
  }, [isOpen, plan.quarterly_id, copyQuarterlyOptions]);

  useEffect(() => {
    if (!isOpen || copyQuarterMonths.length === 0) return;
    if (!copyQuarterMonths.includes(copyTargetMonth)) {
      setCopyTargetMonth(copyQuarterMonths[0]);
    }
  }, [isOpen, copyQuarterMonths, copyTargetMonth]);

  const handleCopyPlan = useCallback(async () => {
    try {
      const targetQuarterly = copyQuarterlyOptions.find(q => q.quarterly_id === copyQuarterlyId) || null;
      if (!targetQuarterly) throw new Error('Не найден квартальный план для выбранного месяца');

      const assigneesForCopy = editAssigneeIds.length > 0 ? editAssigneeIds : assignees.map(a => a.user_id);
      const companiesForCopy = editCompanyIds.length > 0 ? editCompanyIds : [];
      const procedureIdForCopy = editProcedureId || plan.procedure_id;
      if (!procedureIdForCopy) throw new Error('Нельзя скопировать план без выбранной процедуры');

      const newId = await copyPlan({
        plan: {
          quarterlyId: targetQuarterly.quarterly_id,
          procedureId: procedureIdForCopy,
          year: plan.year,
          month: copyTargetMonth,
          description: plan.description || '',
          plannedHours: Number(plan.planned_hours) || 0,
          status: 'draft',
          assignees: assigneesForCopy,
          userId: user.user_id,
          distributionType,
          action: 'create',
        },
        companyIds: companiesForCopy,
        projectIds: editProjectIds,
      });

      // Уведомить Telegram-подписчиков о скопированном плане
      fetch('/api/telegram/notify/plan-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyPlanId: newId }),
      }).catch(() => {}); // fire-and-forget

      onSuccess(newId);
    } catch (e: unknown) {
      // error is managed by usePlanCopy hook; re-throwing is handled
      void getErrorMessage(e); // suppress unused-var warning
    }
  }, [
    copyQuarterlyOptions, copyQuarterlyId, copyTargetMonth,
    plan.year, plan.description, plan.planned_hours, plan.procedure_id,
    editProcedureId, editAssigneeIds, assignees, editCompanyIds,
    user.user_id, distributionType, editProjectIds, onSuccess, copyPlan,
  ]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (copying) return;
        clearError();
        onClose();
      }}
      title="Копировать месячный план"
      headerVariant="gradient-indigo"
    >
      <div className="space-y-4">
        <div>
          <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
            Квартальный план (в работе)
          </label>
          <select
            value={copyQuarterlyId}
            onChange={(e) => setCopyQuarterlyId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            disabled={copying || copyQuarterlyOptions.length === 0}
          >
            {copyQuarterlyOptions.length === 0 ? (
              <option value="">Нет доступных квартальных планов</option>
            ) : (
              copyQuarterlyOptions.map((q) => (
                <option key={q.quarterly_id} value={q.quarterly_id}>
                  Q{q.quarter} - {(q.process_name || 'Без процесса')} - {(q.goal || 'Без названия').slice(0, 60)}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
            Месяц для копии
          </label>
          <select
            value={copyTargetMonth}
            onChange={(e) => setCopyTargetMonth(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            disabled={copying || copyQuarterMonths.length === 0}
          >
            {copyQuarterMonths.map((monthNum) => (
              <option key={monthNum} value={monthNum}>
                {MONTH_NAMES_RU[monthNum - 1]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500 px-1">
          Будет создан новый план со статусом «Черновик» с копированием процедуры, часов, описания, исполнителей и предприятий.
        </p>

        {copyError && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-600">{copyError}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => { clearError(); onClose(); }} disabled={copying}>
            Отмена
          </Button>
          <Button size="sm" onClick={handleCopyPlan} disabled={copying}>
            {copying ? 'Копирование...' : 'Копировать'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
