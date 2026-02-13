'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { KPIResponse } from './types';
import KPIProgressBar from './KPIProgressBar';
import KPIStatusBadge from './KPIStatusBadge';

const MONTH_SHORT = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

interface ProcessKPIViewProps {
  data: KPIResponse;
}

export default function ProcessKPIView({ data }: ProcessKPIViewProps) {
  const { myPlans, monthTrend } = data;

  // Trend chart data
  const trendData = (monthTrend || []).map(t => ({
    name: MONTH_SHORT[t.period - 1] || `${t.period}`,
    План: t.planned,
    Факт: t.actual,
    KPI: t.kpi,
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Trend chart */}
      {trendData.length > 0 && (
        <div className="card-base p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
            Динаміка за квартал
          </h3>
          <div className="h-48 sm:h-56" role="img" aria-label="Графік динаміки KPI за квартал">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(value: number | string | undefined, name: string | undefined) =>
                    name === 'KPI' ? `${value}%` : `${Number(value ?? 0).toFixed(1)} г`
                  }
                />
                <Bar dataKey="План" fill="#a5b4fc" radius={[3, 3, 0, 0]} name="План" />
                <Bar dataKey="Факт" fill="#6366f1" radius={[3, 3, 0, 0]} name="Факт" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* My plans table */}
      {myPlans && myPlans.length > 0 && (
        <div className="card-base p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
            Мої плани
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Таблиця моїх планів">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium">Мероприємство</th>
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium hidden sm:table-cell">Процес</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">План</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">Факт</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium w-16 sm:w-20">KPI</th>
                  <th scope="col" className="py-2 px-2 sm:px-3 text-slate-600 font-medium w-24 sm:w-40 hidden md:table-cell">Прогрес</th>
                </tr>
              </thead>
              <tbody>
                {myPlans.map((plan) => (
                  <tr key={plan.planId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-2 sm:px-3">
                      <div className="font-medium text-slate-800 truncate max-w-[180px] sm:max-w-[250px]" title={plan.measureName}>
                        {plan.measureName}
                      </div>
                      <div className="text-xs text-slate-400 sm:hidden">{plan.processName}</div>
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-slate-500 hidden sm:table-cell truncate max-w-[150px]" title={plan.processName}>
                      {plan.processName}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right font-medium text-slate-700">
                      {plan.planned.toFixed(1)}
                      {plan.assigneeCount > 1 && (
                        <span className="text-xs text-slate-400 ml-0.5" title={`Розділено на ${plan.assigneeCount} виконавців`}>
                          /{plan.assigneeCount}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 sm:px-3 text-right font-medium text-slate-700">{plan.actual.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right">
                      <KPIStatusBadge actual={plan.actual} planned={plan.planned} />
                    </td>
                    <td className="py-2 px-2 sm:px-3 hidden md:table-cell">
                      <KPIProgressBar actual={plan.actual} planned={plan.planned} showLabel={false} height="h-2" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!myPlans || myPlans.length === 0) && (
        <div className="card-base p-8 text-center text-slate-500">
          Немає призначених планів за цей період
        </div>
      )}
    </div>
  );
}
