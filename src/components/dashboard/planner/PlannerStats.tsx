'use client';

import React, { useMemo } from 'react';
import type { CalendarEntry, ActivePlanForSlot } from '@/lib/ops/planner/calendar-entries';

interface Props {
  entries: CalendarEntry[];
  activePlans: ActivePlanForSlot[];
}

function pctChipClasses(pct: number) {
  if (pct >= 80) return { bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', num: 'text-emerald-600', txt: 'text-emerald-800/60' };
  if (pct >= 50) return { bg: 'bg-amber-500/10', border: 'border-amber-500/25', num: 'text-amber-700', txt: 'text-amber-800/60' };
  return { bg: 'bg-indigo-500/10', border: 'border-indigo-500/25', num: 'text-indigo-600', txt: 'text-indigo-700/60' };
}

function StatChip({ value, unit, label, bg, border, num, txt }: {
  value: string; unit: string; label: string;
  bg: string; border: string; num: string; txt: string;
}) {
  return (
    <div className={`flex flex-col items-center flex-1 gap-px py-0.5 px-1.5 rounded-lg border ${bg} ${border}`}>
      <span className={`text-[13px] font-bold ${num}`}>
        {value} <span className="font-medium text-[11px]">{unit}</span>
      </span>
      <span className={`sec-label text-[9px] ${txt}`}>
        {label}
      </span>
    </div>
  );
}

export default function PlannerStats({ entries }: Props) {
  const stats = useMemo(() => {
    let planHours = 0, syncedHours = 0, externalHours = 0;
    for (const e of entries) {
      const hrs = e.duration_minutes / 60;
      if (e.source === 'plan') { planHours += hrs; if (e.outlook_event_id) syncedHours += hrs; }
      else if (e.source === 'external') externalHours += hrs;
    }
    const weeklyCapacity = 32;
    const coverage = weeklyCapacity > 0 ? Math.round((planHours / weeklyCapacity) * 100) : 0;
    return { planHours, syncedHours, externalHours, totalPlanned: weeklyCapacity, coverage };
  }, [entries]);

  const pctCls = pctChipClasses(stats.coverage);
  const fmt = (n: number) => n.toFixed(1).replace('.0', '');

  return (
    <div className="flex items-center gap-0.5">
      <StatChip
        value={`${fmt(stats.planHours)} / ${stats.totalPlanned}`} unit="ч" label="розподілено"
        bg="bg-blue-500/10" border="border-blue-500/25" num="text-blue-900" txt="text-blue-900/60"
      />
      <StatChip
        value={fmt(stats.syncedHours)} unit="ч" label="синхронізовано"
        bg="bg-emerald-500/10" border="border-emerald-500/25" num="text-emerald-900" txt="text-emerald-900/60"
      />
      <StatChip
        value={fmt(stats.externalHours)} unit="ч" label="зовнішніх"
        bg="bg-slate-400/10" border="border-slate-400/25" num="text-slate-600" txt="text-slate-500/60"
      />
      <StatChip
        value={String(stats.coverage)} unit="%" label="покриття"
        bg={pctCls.bg} border={pctCls.border} num={pctCls.num} txt={pctCls.txt}
      />
    </div>
  );
}
