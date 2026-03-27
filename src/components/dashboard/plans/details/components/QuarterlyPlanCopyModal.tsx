import React from 'react';
import { cn } from '@/lib/shared/utils';
import { AnnualPlan } from '@/types/planning';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

const NO_PLAN_TITLE = 'Нет названия плана';

interface QuarterlyPlanCopyModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeAnnualPlans: AnnualPlan[];
  copyAnnualId: string;
  onCopyAnnualIdChange: (id: string) => void;
  copyQuarter: number;
  onCopyQuarterChange: (q: number) => void;
  copyError: string | null;
  copying: boolean;
  onCopy: () => void;
}

export default function QuarterlyPlanCopyModal({
  isOpen,
  onClose,
  activeAnnualPlans,
  copyAnnualId,
  onCopyAnnualIdChange,
  copyQuarter,
  onCopyQuarterChange,
  copyError,
  copying,
  onCopy,
}: QuarterlyPlanCopyModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => { if (copying) return; onClose(); }}
      title="Копировать квартальный план"
      headerVariant="gradient-indigo"
    >
      <div className="space-y-4">
        <div>
          <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
            Годовой план (в работе)
          </label>
          <select
            value={copyAnnualId}
            onChange={(e) => onCopyAnnualIdChange(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            disabled={copying}
          >
            {activeAnnualPlans.length === 0 ? (
              <option value="">Нет активных годовых планов</option>
            ) : (
              activeAnnualPlans.map((a) => (
                <option key={a.annual_id} value={a.annual_id}>
                  {a.year} - {(a.goal?.trim() || NO_PLAN_TITLE).slice(0, 70)}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="text-3xs font-bold text-indigo-400 uppercase tracking-wider mb-1.5 pl-1 block">
            Квартал
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 2, 3, 4].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onCopyQuarterChange(q)}
                className={cn(
                  "px-3 py-2 text-sm rounded-xl border transition-colors",
                  copyQuarter === q
                    ? "bg-indigo-500 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-300"
                )}
                disabled={copying}
              >
                Q{q}
              </button>
            ))}
          </div>
        </div>

        {copyError && (
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm text-red-600">{copyError}</p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={copying}>
            Отмена
          </Button>
          <Button size="sm" onClick={onCopy} disabled={copying || !copyAnnualId}>
            {copying ? 'Копирование...' : 'Копировать'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
