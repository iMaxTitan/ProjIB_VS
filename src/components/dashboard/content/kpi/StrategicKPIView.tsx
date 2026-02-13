'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  LineChart, Line,
} from 'recharts';
import type { KPIResponse } from './types';
import KPIProgressBar from './KPIProgressBar';
import KPIStatusBadge from './KPIStatusBadge';
import { kpi as kpiDesign } from '@/styles/design-system';

const Q_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

interface StrategicKPIViewProps {
  data: KPIResponse;
}

export default function StrategicKPIView({ data }: StrategicKPIViewProps) {
  const { byDepartment, byProcess, byEmployee, byQuarter, norm } = data;
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const toggleDept = useCallback((deptId: string) => {
    setExpandedDept(prev => prev === deptId ? null : deptId);
  }, []);

  // Quarter trend (line chart)
  const trendData = (byQuarter || []).map(t => ({
    name: Q_LABELS[t.period - 1] || `Q${t.period}`,
    KPI: t.kpi,
    norm,
  }));

  // Department chart data
  const deptChartData = (byDepartment || []).map(d => ({
    name: d.name,
    План: d.planned,
    Факт: d.actual,
  }));

  // Heat map: depts × quarters
  const heatMapData = useMemo(() => {
    if (!byDepartment || !byQuarter) return [];
    return byDepartment;
  }, [byDepartment, byQuarter]);

  // Filter processes for expanded department
  const deptProcesses = useMemo(() => {
    if (!expandedDept) return [];
    return byProcess.filter(p => {
      const dept = byDepartment?.find(d => d.name === p.departmentName);
      return dept && dept.id === expandedDept;
    });
  }, [expandedDept, byProcess, byDepartment]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Department comparison */}
        {deptChartData.length > 0 && (
          <div className="card-base p-3 sm:p-5">
            <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
              Відділи: План vs Факт
            </h3>
            <div className="h-56 sm:h-64" role="img" aria-label="Графік план vs факт по відділах">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptChartData} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
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

        {/* Quarter trend line */}
        {trendData.length > 0 && (
          <div className="card-base p-3 sm:p-5">
            <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
              Тренд KPI по кварталах
            </h3>
            <div className="h-56 sm:h-64" role="img" aria-label="Графік тренду KPI по кварталах">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 'auto']} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number | string | undefined, name: string | undefined) =>
                      name === 'norm' ? `${value}% (норма)` : `${value}%`
                    }
                  />
                  <Line type="monotone" dataKey="KPI" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="KPI" />
                  <Line type="monotone" dataKey="norm" stroke="#9ca3af" strokeWidth={1} strokeDasharray="5 5" dot={false} name="Норма" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Heat map: departments table with KPI badges */}
      {heatMapData.length > 0 && (
        <div className="card-base p-3 sm:p-5">
          <h3 className="text-sm sm:text-base font-semibold text-slate-700 mb-3 sm:mb-4">
            Відділи — деталі
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Таблиця KPI відділів з деталями">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium">Відділ</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">План</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium hidden sm:table-cell" title="Рекомендований план (календарні години × кількість співробітників)">Бенч</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium">Факт</th>
                  <th scope="col" className="text-right py-2 px-2 sm:px-3 text-slate-600 font-medium w-20">KPI</th>
                  <th scope="col" className="py-2 px-2 sm:px-3 w-28 sm:w-36 hidden md:table-cell">Прогрес</th>
                </tr>
              </thead>
              <tbody>
                {heatMapData.map(d => {
                  const status = kpiDesign.getKPIStatus(d.actual, d.planned);
                  const bgClass = {
                    exceeds: 'bg-amber-50',
                    good: 'bg-emerald-50',
                    warning: 'bg-orange-50',
                    critical: 'bg-red-50',
                  }[status] || '';

                  return (
                    <React.Fragment key={d.id}>
                      <tr
                        className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${bgClass}`}
                        onClick={() => toggleDept(d.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDept(d.id); } }}
                        aria-label={`${d.name}: KPI ${d.kpi}%. Натисніть для деталей`}
                        aria-expanded={expandedDept === d.id}
                      >
                        <td className="py-2 px-2 sm:px-3 font-medium text-slate-800">
                          <span className="mr-1" aria-hidden="true">{expandedDept === d.id ? '\u25BE' : '\u25B8'}</span>
                          {d.name}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{d.planned.toFixed(1)}</td>
                        <td className="py-2 px-2 sm:px-3 text-right text-slate-500 hidden sm:table-cell">
                          {d.bench != null ? d.bench.toFixed(1) : '—'}
                        </td>
                        <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{d.actual.toFixed(1)}</td>
                        <td className="py-2 px-2 sm:px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-xs sm:text-sm font-medium text-slate-700">{d.kpi.toFixed(1)}%</span>
                            <KPIStatusBadge actual={d.actual} planned={d.planned} />
                          </div>
                        </td>
                        <td className="py-2 px-2 sm:px-3 hidden md:table-cell">
                          <KPIProgressBar actual={d.actual} planned={d.planned} showLabel={false} height="h-2" />
                        </td>
                      </tr>

                      {/* Expanded: processes in this dept */}
                      {expandedDept === d.id && deptProcesses.length > 0 && deptProcesses.map(p => (
                        <tr key={p.id} className="border-b border-slate-50 bg-slate-50/50">
                          <td className="py-1.5 px-2 sm:px-3 pl-6 sm:pl-8 text-slate-600 text-xs sm:text-sm">
                            {p.name}
                          </td>
                          <td className="py-1.5 px-2 sm:px-3 text-right text-slate-500 text-xs sm:text-sm">{p.planned.toFixed(1)}</td>
                          <td className="py-1.5 px-2 sm:px-3 text-right text-slate-400 text-xs sm:text-sm hidden sm:table-cell">
                            {p.bench != null ? p.bench.toFixed(1) : '—'}
                          </td>
                          <td className="py-1.5 px-2 sm:px-3 text-right text-slate-500 text-xs sm:text-sm">{p.actual.toFixed(1)}</td>
                          <td className="py-1.5 px-2 sm:px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs font-medium text-slate-500">{p.kpi.toFixed(1)}%</span>
                              <KPIStatusBadge actual={p.actual} planned={p.planned} />
                            </div>
                          </td>
                          <td className="py-1.5 px-2 sm:px-3 hidden md:table-cell">
                            <KPIProgressBar actual={p.actual} planned={p.planned} showLabel={false} height="h-1.5" />
                          </td>
                        </tr>
                      ))}
                      {expandedDept === d.id && deptProcesses.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-2 px-6 text-xs text-slate-400">Немає процесів</td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
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
            <table className="w-full text-sm" aria-label="Таблиця KPI співробітників організації">
              <thead>
                <tr className="border-b border-slate-200">
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium">Ім&apos;я</th>
                  <th scope="col" className="text-left py-2 px-2 sm:px-3 text-slate-600 font-medium hidden sm:table-cell">Відділ</th>
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
                    <td className="py-2 px-2 sm:px-3 text-slate-500 hidden sm:table-cell">{e.departmentName}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{e.planned.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right text-slate-700">{e.actual.toFixed(1)}</td>
                    <td className="py-2 px-2 sm:px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-xs sm:text-sm font-medium text-slate-700">{e.kpi.toFixed(1)}%</span>
                        <KPIStatusBadge actual={e.actual} planned={e.planned} />
                      </div>
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
