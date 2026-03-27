'use client';

import React from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { reportTableStyles, reportTableRowClass } from '../shared';
import { safeNumber } from './report-utils';
import type { MonthProcessItem } from './types';
import EmptyState from '@/components/ui/EmptyState';

interface QuarterlyDepartmentsTableProps {
  deptReportData: MonthProcessItem[];
  deptLoading: boolean;
}

type ProcGroup = { processId: string; processName: string; rows: MonthProcessItem[] };
type DeptGroup = { deptId: string; deptName: string; capacity: number; processes: ProcGroup[] };

export default function QuarterlyDepartmentsTable({ deptReportData, deptLoading }: QuarterlyDepartmentsTableProps) {
  if (deptLoading) {
    return <div className="flex justify-center items-center py-10"><Spinner /></div>;
  }
  if (deptReportData.length === 0) {
    return <EmptyState title="Нет данных за выбранный квартал" className="p-8" />;
  }

  // Group: department → process → procedures
  const deptGroups: DeptGroup[] = [];
  const deptSeen = new Map<string, number>();
  for (const row of deptReportData) {
    let dIdx = deptSeen.get(row.scopeId);
    if (dIdx === undefined) {
      dIdx = deptGroups.length;
      deptSeen.set(row.scopeId, dIdx);
      deptGroups.push({ deptId: row.scopeId, deptName: row.scopeName, capacity: row.capacityHours || 0, processes: [] });
    }
    const dept = deptGroups[dIdx];
    let procGroup = dept.processes.find(p => p.processId === row.processId);
    if (!procGroup) {
      procGroup = { processId: row.processId, processName: row.processName, rows: [] };
      dept.processes.push(procGroup);
    }
    procGroup.rows.push(row);
  }

  const grandTotalPlanned = deptReportData.reduce((s, r) => s + safeNumber(r.plannedHours), 0);
  const grandTotalHrs = deptReportData.reduce((s, r) => s + safeNumber(r.totalHours), 0);
  const grandTotalCap = deptGroups.reduce((s, g) => s + g.capacity, 0);
  const grandTotalTasks = deptReportData.reduce((s, r) => s + safeNumber(r.tasksCount), 0);
  let rowNum = 0;

  return (
    <table className={reportTableStyles.table}>
      <colgroup>
        <col style={{ width: '36px' }} />
        <col />
        <col style={{ width: '76px' }} />
        <col style={{ width: '76px' }} />
        <col style={{ width: '76px' }} />
        <col style={{ width: '64px' }} />
        <col style={{ width: '64px' }} />
      </colgroup>
      <thead className={reportTableStyles.thead}>
        <tr className={reportTableStyles.headerRow}>
          <th className="text-left px-2 py-2 font-semibold border-r border-slate-200/80">№</th>
          <th className="text-left px-2 py-2 font-semibold border-r border-slate-200/80">Назва</th>
          <th className="text-center px-1.5 py-2 font-semibold border-r border-slate-200/80 text-xs leading-tight">Факт</th>
          <th className="text-center px-1.5 py-2 font-semibold border-r border-slate-200/80 text-xs leading-tight">План</th>
          <th className="text-center px-1.5 py-2 font-semibold border-r border-slate-200/80 text-xs leading-tight">Ёмкость</th>
          <th className="text-center px-1.5 py-2 font-semibold border-r border-slate-200/80 text-xs leading-tight">% загр.</th>
          <th className="text-center px-1.5 py-2 font-semibold text-xs leading-tight">Задачи</th>
        </tr>
      </thead>
      <tbody>
        {deptGroups.map((dg) => {
          const allRows = dg.processes.flatMap(p => p.rows);
          const deptPlanned = allRows.reduce((s, r) => s + safeNumber(r.plannedHours), 0);
          const deptHours = allRows.reduce((s, r) => s + safeNumber(r.totalHours), 0);
          const deptTasks = allRows.reduce((s, r) => s + safeNumber(r.tasksCount), 0);
          const deptPct = dg.capacity > 0 ? Math.round(deptHours / dg.capacity * 100) : 0;
          return (
            <React.Fragment key={dg.deptId}>
              <tr className="bg-indigo-50/60 border-t border-slate-200">
                <td className="px-2 py-1.5 border-r border-slate-200/80" colSpan={2}>
                  <span className="font-semibold text-slate-800 text-xs">{dg.deptName}</span>
                </td>
                <td className="px-1.5 py-1.5 text-slate-800 font-semibold text-center tabular-nums text-xs border-r border-slate-200/80">{deptHours.toFixed(2)}</td>
                <td className="px-1.5 py-1.5 text-slate-800 font-semibold text-center tabular-nums text-xs border-r border-slate-200/80">{deptPlanned > 0 ? deptPlanned.toFixed(2) : '—'}</td>
                <td className="px-1.5 py-1.5 text-slate-800 font-semibold text-center tabular-nums text-xs border-r border-slate-200/80">{dg.capacity > 0 ? dg.capacity.toFixed(0) : '—'}</td>
                <td className="px-1.5 py-1.5 text-slate-800 font-semibold text-center tabular-nums text-xs border-r border-slate-200/80">{dg.capacity > 0 ? `${deptPct}%` : '—'}</td>
                <td className="px-1.5 py-1.5 text-slate-800 font-semibold text-center tabular-nums text-xs">{deptTasks}</td>
              </tr>
              {dg.processes.map((pg) => {
                const procPlanned = pg.rows.reduce((s, r) => s + safeNumber(r.plannedHours), 0);
                const procHours = pg.rows.reduce((s, r) => s + safeNumber(r.totalHours), 0);
                const procTasks = pg.rows.reduce((s, r) => s + safeNumber(r.tasksCount), 0);
                const procCapacity = deptHours > 0 ? (procHours / deptHours) * dg.capacity : 0;
                const procPct = dg.capacity > 0 ? Math.round(procHours / dg.capacity * 100) : 0;
                return (
                  <React.Fragment key={pg.processId}>
                    <tr className="bg-slate-50/80 border-t border-slate-100">
                      <td className="px-2 py-1 border-r border-slate-100"></td>
                      <td className="px-2 py-1 text-slate-700 font-medium text-xs leading-snug border-r border-slate-100 pl-4">{pg.processName}</td>
                      <td className="px-1.5 py-1 text-slate-700 font-medium text-center tabular-nums text-xs border-r border-slate-100">{procHours.toFixed(2)}</td>
                      <td className="px-1.5 py-1 text-slate-700 font-medium text-center tabular-nums text-xs border-r border-slate-100">{procPlanned > 0 ? procPlanned.toFixed(2) : '—'}</td>
                      <td className="px-1.5 py-1 text-slate-500 font-medium text-center tabular-nums text-xs border-r border-slate-100">{procCapacity > 0 ? procCapacity.toFixed(0) : '—'}</td>
                      <td className="px-1.5 py-1 text-slate-500 font-medium text-center tabular-nums text-xs border-r border-slate-100">{dg.capacity > 0 ? `${procPct}%` : '—'}</td>
                      <td className="px-1.5 py-1 text-slate-700 font-medium text-center tabular-nums text-xs">{procTasks}</td>
                    </tr>
                    {pg.rows.map((row) => {
                      rowNum += 1;
                      return (
                        <tr key={row.key} className={reportTableRowClass(rowNum, 'middle')}>
                          <td className="px-2 py-1 text-slate-400 border-r border-slate-100 text-[11px]">{rowNum}</td>
                          <td className="px-2 py-1 text-slate-500 leading-snug border-r border-slate-100 pl-7 text-[11px]">{row.procedureName || '—'}</td>
                          <td className="px-1.5 py-1 text-slate-500 text-center tabular-nums text-[11px] border-r border-slate-100">{safeNumber(row.totalHours).toFixed(2)}</td>
                          {(() => {
                            const planned = safeNumber(row.plannedHours);
                            const rowCap = deptHours > 0 ? (safeNumber(row.totalHours) / deptHours) * dg.capacity : 0;
                            return (
                              <>
                                <td className="px-1.5 py-1 text-center tabular-nums text-[11px] border-r border-slate-100">
                                  {planned > 0 ? (
                                    <span className="inline-flex items-center gap-0.5">
                                      <span className="text-slate-400">{planned.toFixed(2)}</span>
                                      {rowCap > 0 && (() => {
                                        const diff = Math.abs(planned - rowCap) / rowCap;
                                        if (diff <= 0.2) return null;
                                        if (planned < rowCap) return <span className="text-[10px] text-green-500">&#9650;</span>;
                                        return <span className="text-[10px] text-orange-500">&#9660;</span>;
                                      })()}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="px-1.5 py-1 text-slate-400 text-center tabular-nums text-[11px] border-r border-slate-100">{rowCap > 0 ? rowCap.toFixed(0) : '—'}</td>
                              </>
                            );
                          })()}
                          <td className="px-1.5 py-1 text-slate-400 text-center tabular-nums text-[11px] border-r border-slate-100">{dg.capacity > 0 ? `${Math.round(safeNumber(row.totalHours) / dg.capacity * 100)}%` : '—'}</td>
                          <td className="px-1.5 py-1 text-slate-500 text-center tabular-nums text-[11px]">{safeNumber(row.tasksCount)}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="bg-slate-50 border-t-2 border-slate-300">
          <td className="px-2 py-2 text-slate-800 font-semibold border-r border-slate-200/80" colSpan={2}>Итого</td>
          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">{grandTotalHrs.toFixed(2)}</td>
          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">{grandTotalPlanned > 0 ? grandTotalPlanned.toFixed(2) : '—'}</td>
          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">{grandTotalCap > 0 ? grandTotalCap.toFixed(0) : '—'}</td>
          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">{grandTotalCap > 0 ? `${Math.round(grandTotalHrs / grandTotalCap * 100)}%` : '—'}</td>
          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums">{grandTotalTasks}</td>
        </tr>
      </tfoot>
    </table>
  );
}
