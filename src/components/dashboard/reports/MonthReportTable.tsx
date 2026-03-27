'use client';

import React from 'react';
import { Building2, Users, Briefcase, Target, BarChart3, FileSpreadsheet } from 'lucide-react';
import { PlanStatus } from '@/types/planning';
import { getStatusColorClasses } from '@/lib/ops/plans/planning-utils';
import { Spinner } from '@/components/ui/Spinner';
import {
  GradientDetailCard,
  reportTableStyles,
  reportTableRowClass,
  reportSegmentedButtonClass,
  reportActionButtonClass,
} from '../shared';
import { CalendarDays } from 'lucide-react';
import { MONTH_NAMES_RU, safeNumber } from './report-utils';
import type { MonthProcessItem } from './types';
import EmptyState from '@/components/ui/EmptyState';

type MonthRightTab = 'process' | 'procedure' | 'company' | 'employee' | 'department';

interface Props {
  monthLoading: boolean;
  monthTableRows: MonthProcessItem[];
  monthRightTab: MonthRightTab;
  selectedMonth: number;
  selectedYear: number;
  showScopeColumn: boolean;
  isDepartmentTab: boolean;
  monthExportingXlsx: boolean;
  onExportXlsx: () => void;
  onSetRightTab: (tab: MonthRightTab) => void;
}

export default function MonthReportTable({
  monthLoading,
  monthTableRows,
  monthRightTab,
  selectedMonth,
  selectedYear,
  showScopeColumn,
  isDepartmentTab,
  monthExportingXlsx,
  onExportXlsx,
  onSetRightTab,
}: Props) {
  if (monthLoading) {
    return (
      <div className="h-full min-h-0 overflow-auto">
        <GradientDetailCard
          modeLabel="Загрузка..."
          isEditing={false}
          canEdit={false}
          gradientClassName="from-purple-500 to-indigo-500"
          cardClassName="max-w-none w-full"
          bodyClassName="flex justify-center py-10"
        >
          <Spinner />
        </GradientDetailCard>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto">
      <GradientDetailCard
        modeLabel="Просмотр"
        isEditing={false}
        canEdit={false}
        gradientClassName="from-purple-500 to-indigo-500"
        cardClassName="max-w-none w-full"
        bodyClassName="space-y-4"
        headerContent={
          <div className="min-w-0 flex items-center gap-3">
            <CalendarDays className="w-5 h-5 opacity-90" aria-hidden="true" />
            <div className="min-w-0">
              <div className="font-bold text-lg leading-tight">Сводная</div>
              <div className="text-xs text-white/80">{MONTH_NAMES_RU[selectedMonth - 1]} {selectedYear}</div>
            </div>
          </div>
        }
      >
        <div className="text-sm text-slate-700 font-semibold">
          {monthTableRows.length} {monthRightTab === 'process' ? 'процессов'
            : monthRightTab === 'procedure' ? 'процедур'
              : monthRightTab === 'employee' ? 'сотрудников'
                : monthRightTab === 'department' ? 'отделов'
                  : 'предприятий'}
        </div>

        <div className={reportTableStyles.frame}>
          {monthTableRows.length ? (
            <div className={reportTableStyles.scroll}>
              <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
                <div className={reportTableStyles.segmentedGroup} role="radiogroup" aria-label="Группировка месячной сводной">
                  <button type="button" role="radio" aria-checked={monthRightTab === 'company'} aria-label="Группировать по предприятиям" onClick={() => onSetRightTab('company')} className={reportSegmentedButtonClass(monthRightTab === 'company')}>
                    <Building2 aria-hidden="true" className="h-3.5 w-3.5" />Предприятия
                  </button>
                  <button type="button" role="radio" aria-checked={monthRightTab === 'department'} aria-label="Группировать по отделам" onClick={() => onSetRightTab('department')} className={reportSegmentedButtonClass(monthRightTab === 'department')}>
                    <Briefcase aria-hidden="true" className="h-3.5 w-3.5" />Отделы
                  </button>
                  <button type="button" role="radio" aria-checked={monthRightTab === 'employee'} aria-label="Группировать по сотрудникам" onClick={() => onSetRightTab('employee')} className={reportSegmentedButtonClass(monthRightTab === 'employee')}>
                    <Users aria-hidden="true" className="h-3.5 w-3.5" />Сотрудники
                  </button>
                  <button type="button" role="radio" aria-checked={monthRightTab === 'procedure'} aria-label="Группировать по процедурам" onClick={() => onSetRightTab('procedure')} className={reportSegmentedButtonClass(monthRightTab === 'procedure')}>
                    <Target aria-hidden="true" className="h-3.5 w-3.5" />Процедуры
                  </button>
                  <button type="button" role="radio" aria-checked={monthRightTab === 'process'} aria-label="Группировать по процессам" onClick={() => onSetRightTab('process')} className={reportSegmentedButtonClass(monthRightTab === 'process')}>
                    <BarChart3 aria-hidden="true" className="h-3.5 w-3.5" />Процессы
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onExportXlsx}
                  disabled={monthExportingXlsx || monthTableRows.length === 0}
                  aria-label="Скачать месячную сводную в XLSX"
                  className={reportActionButtonClass('pdf')}
                >
                  {monthExportingXlsx ? (
                    <>
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                      <span>XLSX...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet aria-hidden="true" className="w-4 h-4" />
                      <span>XLSX</span>
                    </>
                  )}
                </button>
              </div>
              <table className={reportTableStyles.table}>
                <colgroup>
                  <col style={{ width: '36px' }} />
                  <col style={isDepartmentTab ? { width: '200px' } : undefined} />
                  {showScopeColumn && <col style={{ width: '92px' }} />}
                  {isDepartmentTab && <col style={{ width: '72px' }} />}
                  {isDepartmentTab && <col style={{ width: '82px' }} />}
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '92px' }} />
                  <col style={{ width: '92px' }} />
                </colgroup>
                <thead className={reportTableStyles.thead}>
                  <tr className={reportTableStyles.headerRow}>
                    <th className="text-left px-2 py-2 font-semibold border-r border-slate-200/80">№</th>
                    <th className="text-left px-2 py-2 font-semibold border-r border-slate-200/80">
                      {monthRightTab === 'process' ? 'Процесс'
                        : monthRightTab === 'procedure' ? 'Процедура'
                          : monthRightTab === 'employee' ? 'Сотрудник'
                            : monthRightTab === 'department' ? 'Отдел'
                              : 'Предприятие'}
                    </th>
                    {showScopeColumn && <th className="text-center px-2 py-2 font-semibold border-r border-slate-200/80">Отдел</th>}
                    {isDepartmentTab && <th className="text-center px-1.5 py-2 font-semibold border-r border-slate-200/80 text-xs leading-tight">Сотруд.</th>}
                    {isDepartmentTab && <th className="text-center px-1.5 py-2 font-semibold border-r border-slate-200/80 text-xs leading-tight">% ємн.</th>}
                    <th className="text-center px-2 py-2 font-semibold border-r border-slate-200/80">Задачи</th>
                    <th className="text-center px-2 py-2 font-semibold border-r border-slate-200/80">Часы</th>
                    <th className="text-center px-2 py-2 font-semibold">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {monthTableRows.map((row, idx) => (
                    <tr key={row.key} className={reportTableRowClass(idx, 'middle')}>
                      <td className="px-2 py-2 text-slate-500 border-r border-slate-100">{idx + 1}</td>
                      <td className="px-2 py-2 text-slate-700 leading-snug border-r border-slate-100 align-middle">
                        {monthRightTab === 'company' || monthRightTab === 'department' ? row.scopeName : row.processName}
                      </td>
                      {showScopeColumn && (
                        <td className="px-2 py-2 text-slate-600 leading-snug border-r border-slate-100 align-middle text-center">{row.scopeName}</td>
                      )}
                      {isDepartmentTab && (
                        <td className="px-1.5 py-2 text-slate-700 text-center tabular-nums border-r border-slate-100 align-middle">{row.employeesCount ?? 0}</td>
                      )}
                      {isDepartmentTab && (
                        <td className="px-1.5 py-2 text-slate-700 text-center tabular-nums border-r border-slate-100 align-middle">
                          {row.capacityHours ? `${Math.round(row.totalHours / row.capacityHours * 100)}%` : '—'}
                        </td>
                      )}
                      <td className="px-2 py-2 text-slate-700 text-center tabular-nums border-r border-slate-100 align-middle">{safeNumber(row.tasksCount)}</td>
                      <td className="px-2 py-2 text-slate-700 text-center tabular-nums border-r border-slate-100 align-middle">{safeNumber(row.totalHours).toFixed(2)}</td>
                      <td className="px-1 py-2 text-center whitespace-nowrap">
                        {(() => {
                          const badges = [
                            { key: 'active', value: safeNumber(row.activeCount), className: getStatusColorClasses('active' as PlanStatus) },
                            { key: 'completed', value: safeNumber(row.completedCount), className: getStatusColorClasses('completed' as PlanStatus) },
                          ].filter((b) => b.value > 0);
                          const visibleBadges = badges.length > 0
                            ? badges
                            : [{ key: 'active-zero', value: 0, className: getStatusColorClasses('active' as PlanStatus) }];
                          return (
                            <span className="inline-flex items-center justify-center gap-1.5">
                              {visibleBadges.map((b) => (
                                <span key={b.key} className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold leading-none ${b.className}`}>
                                  {b.value}
                                </span>
                              ))}
                            </span>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-300">
                    <td className="px-2 py-2 text-slate-800 font-semibold border-r border-slate-200/80" colSpan={showScopeColumn ? 3 : 2}>Итого</td>
                    {isDepartmentTab && (() => {
                      const totalEmps = monthTableRows.reduce((s, r) => s + (r.employeesCount ?? 0), 0);
                      const totalHrs = monthTableRows.reduce((s, r) => s + safeNumber(r.totalHours), 0);
                      const totalCap = monthTableRows.reduce((s, r) => s + (r.capacityHours ?? 0), 0);
                      return (
                        <>
                          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">{totalEmps}</td>
                          <td className="px-1.5 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">
                            {totalCap ? `${Math.round(totalHrs / totalCap * 100)}%` : '—'}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-2 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">
                      {monthTableRows.reduce((sum, row) => sum + safeNumber(row.tasksCount), 0)}
                    </td>
                    <td className="px-2 py-2 text-slate-800 font-semibold text-center tabular-nums border-r border-slate-200/80">
                      {monthTableRows.reduce((sum, row) => sum + safeNumber(row.totalHours), 0).toFixed(2)}
                    </td>
                    <td className="px-2 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <EmptyState title="Нет данных за выбранный период" className="p-8" />
          )}
        </div>
      </GradientDetailCard>
    </div>
  );
}
