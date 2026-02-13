'use client';

import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { PivotResponse, PivotDataRow } from '@/types/pivot';

const COLORS = {
  indigo500: '#6366f1',
  indigo300: '#a5b4fc',
  blue500: '#3b82f6',
  emerald500: '#10b981',
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-5">
      <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">{title}</h3>
      <div className="h-56 sm:h-64" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
          {entry.name}: <span className="font-semibold">{entry.value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</span>
        </p>
      ))}
    </div>
  );
}

/** Plan vs Fact: aggregates hours & planned per time bucket from pivot rows. */
export function HoursByBucketChart({ data }: { data: PivotResponse }) {
  const chartData = data.meta.timeBuckets.map(tb => {
    let hours = 0;
    let planned = 0;
    for (const row of data.rows) {
      hours += row.buckets[tb.key] || 0;
      planned += row.plannedBuckets?.[tb.key] || 0;
    }
    return { name: tb.label, Факт: Math.round(hours * 10) / 10, План: Math.round(planned * 10) / 10 };
  });

  return (
    <ChartCard title="План vs факт">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="План" fill={COLORS.indigo300} radius={[3, 3, 0, 0]} name="План" />
          <Bar dataKey="Факт" fill={COLORS.indigo500} radius={[3, 3, 0, 0]} name="Факт" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Top N items — vertical bar chart for any dimension. */
export function TopItemsChart({ rows, title, limit = 10 }: { rows: PivotDataRow[]; title: string; limit?: number }) {
  const chartData = [...rows]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map(row => ({
      name: (row.dimensions[0]?.name || '—').length > 18
        ? `${row.dimensions[0].name.slice(0, 18)}...`
        : (row.dimensions[0]?.name || '—'),
      value: row.total,
    }));

  return (
    <ChartCard title={title}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" fill={COLORS.blue500} radius={[3, 3, 0, 0]} name="Значение" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

/** Horizontal bar chart — suited for employee rankings. */
export function TopEmployeesChart({ rows, limit = 10 }: { rows: PivotDataRow[]; limit?: number }) {
  const chartData = [...rows]
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)
    .map(row => ({
      name: (row.dimensions[0]?.name || '—').length > 20
        ? `${row.dimensions[0].name.slice(0, 20)}...`
        : (row.dimensions[0]?.name || '—'),
      fullName: row.dimensions[0]?.name || '',
      hours: row.total,
    }))
    .reverse();

  return (
    <ChartCard title="Топ сотрудников">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: '#64748b' }} />
          <Tooltip
            formatter={(value) => `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}`}
            labelFormatter={(_label, payload) => {
              const first = Array.isArray(payload) ? payload[0] : undefined;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return (first?.payload as any)?.fullName || '';
            }}
          />
          <Bar dataKey="hours" fill={COLORS.emerald500} radius={[0, 4, 4, 0]} name="Часы" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
