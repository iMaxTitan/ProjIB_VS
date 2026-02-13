'use client';

import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import type { KPIMetricRow } from './types';
import { kpi as kpiDesign } from '@/styles/design-system';

interface ProcessEfficiencyChartProps {
  processes: KPIMetricRow[];
  norm?: number;
}

const STATUS_COLORS: Record<string, string> = {
  exceeds: '#f59e0b',
  good: '#10b981',
  warning: '#fb923c',
  critical: '#ef4444',
};

export default function ProcessEfficiencyChart({ processes, norm = 70 }: ProcessEfficiencyChartProps) {
  const chartData = useMemo(() => {
    if (!processes.length) return [];
    return [...processes]
      .sort((a, b) => b.kpi - a.kpi)
      .slice(0, 12)
      .map(p => ({
        name: p.name.length > 20 ? p.name.slice(0, 20) + '\u2026' : p.name,
        fullName: p.name,
        dept: p.departmentName,
        KPI: Math.round(p.kpi * 10) / 10,
        planned: p.planned,
        actual: p.actual,
        status: kpiDesign.getKPIStatus(p.actual, p.planned),
      }));
  }, [processes]);

  if (!chartData.length) return null;

  const maxKPI = Math.max(...chartData.map(d => d.KPI), norm + 10);

  return (
    <div className="card-base p-3 sm:p-5">
      <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
        Ефективність процесів
      </h3>
      <div
        className="w-full"
        style={{ height: Math.max(200, chartData.length * 36 + 40) }}
        role="img"
        aria-label="Горизонтальний графік ефективності процесів"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis
              type="number"
              domain={[0, Math.ceil(maxKPI / 10) * 10]}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={140}
              tick={{ fontSize: 11, fill: '#475569' }}
            />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
              formatter={(value: number | string | undefined) => [`${Number(value ?? 0)}%`, 'KPI']}
              labelFormatter={(_label, payload) => {
                const item = Array.isArray(payload) && payload[0]?.payload;
                if (!item) return '';
                return `${item.fullName}\n${item.dept} | План: ${item.planned.toFixed(1)}г, Факт: ${item.actual.toFixed(1)}г`;
              }}
            />
            <ReferenceLine
              x={norm}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              label={{
                value: `${norm}%`,
                position: 'top',
                fill: '#94a3b8',
                fontSize: 10,
              }}
            />
            <Bar dataKey="KPI" radius={[0, 4, 4, 0]} barSize={20}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={STATUS_COLORS[entry.status] || '#10b981'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
