'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { KPIResponse } from './types';
import KPIProgressBar from './KPIProgressBar';
import KPIStatusBadge from './KPIStatusBadge';

const Q_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

interface OperationalKPIViewProps {
  data: KPIResponse;
}

export default function OperationalKPIView({ data }: OperationalKPIViewProps) {
  const { byProcess, byEmployee, quarterTrend } = data;

  const trendData = (quarterTrend || []).map(t => ({
    name: Q_LABELS[t.period - 1] || `Q${t.period}`,
    План: t.planned,
    Факт: t.actual,
    'KPI%': t.kpi,
  }));

  const processChartData = byProcess.slice(0, 8).map(p => ({
    name: p.name.length > 14 ? p.name.slice(0, 14) + '\u2026' : p.name,
    fullName: p.name,
    План: p.planned,
    Факт: p.actual,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Process chart */}
        {processChartData.length > 0 && (
          <div className="card-base p-3 sm:p-5">
            <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
              План vs Факт по процесах
            </h3>
            <div className="h-56 sm:h-64" role="img" aria-label="Графік план vs факт по процесах">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={processChartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    labelFormatter={(_label, payload) => {
                      const first = Array.isArray(payload) ? payload[0] : undefined;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      return (first?.payload as any)?.fullName || '';
                    }}
                    formatter={(value: number | string | undefined) => `${Number(value ?? 0).toFixed(1)} г`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="План" fill="#a5b4fc" radius={[3, 3, 0, 0]} name="План" />
                  <Bar dataKey="Факт" fill="#6366f1" radius={[3, 3, 0, 0]} name="Факт" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Quarter trend */}
        {trendData.length > 0 && (
          <div className="card-base p-3 sm:p-5">
            <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
              Тренд по кварталах
            </h3>
            <div className="h-56 sm:h-64" role="img" aria-label="Графік тренду KPI по кварталах">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number | string | undefined, name: string | undefined) =>
                      name === 'KPI%' ? `${value}%` : `${Number(value ?? 0).toFixed(1)} г`
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="План" fill="#a5b4fc" radius={[3, 3, 0, 0]} name="План" />
                  <Bar dataKey="Факт" fill="#6366f1" radius={[3, 3, 0, 0]} name="Факт" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Processes table */}
      {byProcess.length > 0 && (
        <div className="card-base p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
            Процеси
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Таблиця процесів відділу">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium">Процес</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">План</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">Факт</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium w-16">KPI</th>
                  <th scope="col" className="py-2 px-2 sm:px-3 w-28 sm:w-36 hidden sm:table-cell">Прогрес</th>
                </tr>
              </thead>
              <tbody>
                {byProcess.map(p => (
                  <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-2 sm:px-3 font-medium text-slate-800 truncate max-w-[200px]" title={p.name}>{p.name}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{p.planned.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{p.actual.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right">
                      <KPIStatusBadge actual={p.actual} planned={p.planned} />
                    </td>
                    <td className="py-2 px-2 sm:px-3 hidden sm:table-cell">
                      <KPIProgressBar actual={p.actual} planned={p.planned} showLabel={false} height="h-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Employees table */}
      {byEmployee && byEmployee.length > 0 && (
        <div className="card-base p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
            Співробітники
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Таблиця KPI співробітників">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium">Ім&apos;я</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">План</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">Факт</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium w-16">KPI</th>
                  <th scope="col" className="py-2 px-2 sm:px-3 w-28 sm:w-36 hidden sm:table-cell">Прогрес</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map(e => (
                  <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-2 sm:px-3 font-medium text-slate-800">{e.name}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{e.planned.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{e.actual.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right">
                      <KPIStatusBadge actual={e.actual} planned={e.planned} />
                    </td>
                    <td className="py-2 px-2 sm:px-3 hidden sm:table-cell">
                      <KPIProgressBar actual={e.actual} planned={e.planned} showLabel={false} height="h-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
