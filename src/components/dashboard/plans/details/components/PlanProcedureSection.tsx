'use client';

import React from 'react';
import { Info } from 'lucide-react';
import { DetailSection } from '@/components/dashboard/shared';
import type { Procedure } from '@/types/planning';

const PERIOD_LABELS: Record<'year' | 'quarter' | 'month', string> = {
  year: 'в год',
  quarter: 'в квартал',
  month: 'в месяц',
};

interface PlanProcedureSectionProps {
  isEditing: boolean;
  editProcedureId: string;
  availableProcedures: Procedure[];
  planProcedureName?: string | null;
  currentProcedureDescription: string | null;
  hasLinkedQuarterly: boolean;
  onProcedureChange: (procedureId: string, suggestedHours: number) => void;
}

export default function PlanProcedureSection({
  isEditing,
  editProcedureId,
  availableProcedures,
  planProcedureName,
  currentProcedureDescription,
  hasLinkedQuarterly,
  onProcedureChange,
}: PlanProcedureSectionProps) {
  return (
    <>
      <DetailSection title="Процедура" colorScheme="indigo">
        {isEditing ? (
          <select
            value={editProcedureId}
            onChange={(e) => {
              const id = e.target.value;
              const selected = availableProcedures.find(m => m.procedure_id === id);
              const hours = selected
                ? (() => {
                    const v = Number(selected.target_value) || 0;
                    if (v <= 0) return 0;
                    if (selected.target_period === 'month') return Math.round(v);
                    if (selected.target_period === 'year') return Math.round(v / 12);
                    return Math.round(v / 3);
                  })()
                : 0;
              onProcedureChange(id, hours);
            }}
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            disabled={availableProcedures.length === 0 && !editProcedureId}
          >
            <option value="">
              {availableProcedures.length === 0
                ? (hasLinkedQuarterly ? 'Нет доступных процедур' : 'Сначала выберите квартальный план')
                : 'Выберите процедуру...'}
            </option>
            {availableProcedures.map(m => (
              <option key={m.procedure_id} value={m.procedure_id}>
                {m.name} ({m.target_value} ч. {PERIOD_LABELS[m.target_period]})
              </option>
            ))}
          </select>
        ) : (
          <div className="glass-card p-3 rounded-2xl text-xs font-medium text-slate-700 bg-white/40 leading-snug">
            {planProcedureName || <span className="text-slate-500 italic">Процедура не выбрана</span>}
          </div>
        )}
      </DetailSection>

      {currentProcedureDescription && (
        <div className="relative rounded-xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-yellow-50/70 p-3 sm:p-4 shadow-sm">
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 mt-0.5">
              <div className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center">
                <Info className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-3xs font-bold text-amber-600/80 uppercase tracking-wider mb-1">Описание процедуры</div>
              <div className="text-xs sm:text-sm text-amber-900/80 leading-relaxed whitespace-pre-line">
                {currentProcedureDescription}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
