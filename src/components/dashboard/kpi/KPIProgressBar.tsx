'use client';

import React from 'react';
import { kpi as kpiDesign } from '@/styles/design-system';

interface KPIProgressBarProps {
  actual: number;
  planned: number;
  norm?: number;
  showLabel?: boolean;
  height?: string;
}

export default function KPIProgressBar({
  actual,
  planned,
  showLabel = true,
  height = 'h-2.5',
}: KPIProgressBarProps) {
  const kpiPct = planned > 0 ? (actual / planned) * 100 : 0;
  const status = kpiDesign.getKPIStatus(actual, planned);
  const color = kpiDesign.getColor(status);
  const fillWidth = Math.min(kpiPct, 100);

  return (
    <div className="w-full" role="progressbar" aria-valuenow={Math.round(kpiPct)} aria-valuemin={0} aria-valuemax={130} aria-label={`KPI ${kpiPct.toFixed(1)}%`}>
      <div className={`relative w-full bg-slate-200 rounded-full ${height}`}>
        {/* Fill — 100% bar = 130% KPI (exceeds threshold) */}
        <div
          className={`${height} rounded-full transition-[width] duration-200`}
          style={{ width: `${Math.min((kpiPct / 130) * 100, 100)}%`, backgroundColor: color }}
        />
        {/* Norm marker at 100% of plan (= 100/130 ≈ 76.9% of bar) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-slate-500 opacity-40"
          style={{ left: `${(100 / 130) * 100}%` }}
          aria-hidden="true"
        />
      </div>
      {showLabel && (
        <div className="flex justify-between text-xs sm:text-sm text-slate-500 mt-1">
          <span>{kpiPct.toFixed(1)}%</span>
          <span>{actual.toFixed(1)} / {planned.toFixed(1)} г</span>
        </div>
      )}
    </div>
  );
}
