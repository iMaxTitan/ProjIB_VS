'use client';

import React, { useId } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface KPIGaugeProps {
  kpiPercent: number;
  planned: number;
  actual: number;
  norm?: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 120, md: 160, lg: 200 };
const LABEL_SIZES = { sm: 'text-lg', md: 'text-2xl', lg: 'text-3xl' };

export default function KPIGauge({ kpiPercent, planned, actual, size = 'md' }: KPIGaugeProps) {
  const gradientId = useId().replace(/:/g, '_');
  const dim = SIZES[size];

  // Semi-circle gauge: 180 degrees, cap at 150%
  const capped = Math.min(kpiPercent, 150);
  const fillAngle = (capped / 150) * 180;
  const emptyAngle = 180 - fillAngle;

  const data = [
    { value: fillAngle, key: 'fill' },
    { value: emptyAngle, key: 'empty' },
  ];

  return (
    <div className="flex flex-col items-center" style={{ width: dim, height: dim * 0.7 }}>
      <div
        className="relative"
        style={{ width: dim, height: dim / 2 + 10 }}
        role="img"
        aria-label={`KPI ${kpiPercent.toFixed(1)}%, план ${planned.toFixed(1)} годин, факт ${actual.toFixed(1)} годин`}
      >
        <ResponsiveContainer width="100%" height={dim / 2 + 10}>
          <PieChart>
            <defs>
              <linearGradient id={`gauge-grad-${gradientId}`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#6ee7b7" />
                <stop offset="50%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={180}
              endAngle={0}
              innerRadius={dim * 0.3}
              outerRadius={dim * 0.45}
              dataKey="value"
              stroke="none"
              isAnimationActive
            >
              <Cell fill={`url(#gauge-grad-${gradientId})`} />
              <Cell fill="#e2e8f0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label */}
        <div
          className="absolute inset-x-0 bottom-0 flex flex-col items-center"
          style={{ paddingBottom: 2 }}
        >
          <span className={`font-semibold text-emerald-600 ${LABEL_SIZES[size]}`}>
            {kpiPercent.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Planned / Actual */}
      <div className="flex gap-2 sm:gap-3 text-xs sm:text-sm text-slate-500 mt-1.5 sm:mt-2">
        <span>План: <span className="font-medium text-slate-700">{planned.toFixed(1)}г</span></span>
        <span>Факт: <span className="font-medium text-slate-700">{actual.toFixed(1)}г</span></span>
      </div>
    </div>
  );
}
