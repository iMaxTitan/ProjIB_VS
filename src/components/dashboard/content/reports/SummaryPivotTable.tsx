'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpDown } from 'lucide-react';
import type { PivotResponse, PivotDataRow, TimeBucket } from '@/types/pivot';

interface DynamicPivotTableProps {
  data: PivotResponse;
}

type SortConfig = { field: 'name' | 'total' | string; direction: 'asc' | 'desc' };

export default function DynamicPivotTable({ data }: DynamicPivotTableProps) {
  const [sort, setSort] = useState<SortConfig>({ field: 'total', direction: 'desc' });

  const { rows, meta, columnTotals, grandTotal } = data;
  const timeBuckets = meta.timeBuckets;

  const metricLabel = useMemo(() => {
    const labels: Record<string, string> = { hours: 'ч.', tasks: 'зад.', planned: 'план', cost: 'грн', kpi: '%' };
    return labels[meta.metric] || '';
  }, [meta.metric]);

  function getCellValue(row: PivotDataRow, tb: TimeBucket): number {
    return row.buckets[tb.key] || 0;
  }

  function formatValue(val: number): string {
    if (meta.metric === 'kpi') return val > 0 ? `${val.toFixed(1)}%` : '—';
    if (meta.metric === 'tasks') return val > 0 ? String(Math.round(val)) : '—';
    if (meta.metric === 'cost') return val > 0 ? val.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) : '—';
    return val > 0 ? val.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—';
  }

  function getDimensionLabel(row: PivotDataRow): string {
    return row.dimensions.map(d => d.name).join(' / ');
  }

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      if (sort.field === 'name') {
        const valA = getDimensionLabel(a).toLowerCase();
        const valB = getDimensionLabel(b).toLowerCase();
        return sort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      let valA: number;
      let valB: number;
      if (sort.field === 'total') {
        valA = a.total;
        valB = b.total;
      } else {
        valA = a.buckets[sort.field] || 0;
        valB = b.buckets[sort.field] || 0;
      }
      return sort.direction === 'asc' ? valA - valB : valB - valA;
    });
    return sorted;
  }, [rows, sort]);

  function toggleSort(field: string) {
    setSort(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  function handleSortKeyDown(field: string) {
    return (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(field); }
    };
  }

  function ariaSortValue(field: string): 'ascending' | 'descending' | 'none' {
    if (sort.field !== field) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  const thBase = 'px-2 sm:px-3 py-2 text-xs font-medium text-slate-500 whitespace-nowrap cursor-pointer select-none transition-colors hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset';
  const tdBase = 'px-2 sm:px-3 py-1.5 text-xs text-right tabular-nums';

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-12 text-center text-sm text-slate-400">
        Нет данных за выбранный период
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-3 sm:px-4 py-2.5 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">
          {meta.groupBy.map(g => {
            const labels: Record<string, string> = { company: 'Предприятие', department: 'Отдел', employee: 'Сотрудник', process: 'Процесс', measure: 'Мероприятие', category: 'Категория' };
            return labels[g] || g;
          }).join(' × ')}
          {' '}• {metricLabel}
        </span>
        <span className="text-xs text-slate-400">{rows.length} строк</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" role="table">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50">
              <th
                role="button"
                tabIndex={0}
                className={cn(thBase, 'text-left sticky left-0 bg-slate-50 z-10 min-w-[140px] sm:min-w-[200px]')}
                onClick={() => toggleSort('name')}
                onKeyDown={handleSortKeyDown('name')}
                aria-label="Сортировать по названию"
                aria-sort={ariaSortValue('name')}
              >
                <span className="flex items-center gap-1">
                  Название
                  <ArrowUpDown aria-hidden="true" className={cn('h-3 w-3', sort.field === 'name' ? 'text-indigo-500' : 'text-slate-300')} />
                </span>
              </th>
              {timeBuckets.map(tb => (
                <th
                  key={tb.key}
                  role="button"
                  tabIndex={0}
                  className={cn(thBase, 'text-right')}
                  onClick={() => toggleSort(tb.key)}
                  onKeyDown={handleSortKeyDown(tb.key)}
                  aria-label={`Сортировать по ${tb.label}`}
                  aria-sort={ariaSortValue(tb.key)}
                >
                  <span className="flex items-center justify-end gap-1">
                    {tb.label}
                    <ArrowUpDown aria-hidden="true" className={cn('h-3 w-3', sort.field === tb.key ? 'text-indigo-500' : 'text-slate-300')} />
                  </span>
                </th>
              ))}
              <th
                role="button"
                tabIndex={0}
                className={cn(thBase, 'text-right font-semibold text-slate-700')}
                onClick={() => toggleSort('total')}
                onKeyDown={handleSortKeyDown('total')}
                aria-label="Сортировать по итогу"
                aria-sort={ariaSortValue('total')}
              >
                <span className="flex items-center justify-end gap-1">
                  Итого
                  <ArrowUpDown aria-hidden="true" className={cn('h-3 w-3', sort.field === 'total' ? 'text-indigo-500' : 'text-slate-300')} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr
                key={row.dimensions.map(d => d.id).join('::')}
                className={cn('border-b border-slate-100 transition-colors hover:bg-indigo-50/30', idx % 2 === 1 && 'bg-slate-50/30')}
              >
                <td
                  className="px-2 sm:px-3 py-1.5 text-xs font-medium text-slate-700 sticky left-0 bg-inherit z-10 truncate max-w-[200px] sm:max-w-[280px]"
                  title={getDimensionLabel(row)}
                >
                  {getDimensionLabel(row)}
                </td>
                {timeBuckets.map(tb => (
                  <td key={tb.key} className={cn(tdBase, getCellValue(row, tb) > 0 ? 'text-slate-700' : 'text-slate-300')}>
                    {formatValue(getCellValue(row, tb))}
                  </td>
                ))}
                <td className={cn(tdBase, 'font-semibold text-slate-800')}>
                  {formatValue(row.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50">
              <td className="px-2 sm:px-3 py-2 text-xs font-bold text-slate-800 sticky left-0 bg-slate-50 z-10">Итого</td>
              {timeBuckets.map(tb => (
                <td key={tb.key} className={cn(tdBase, 'font-bold text-slate-800')}>
                  {formatValue(columnTotals[tb.key] || 0)}
                </td>
              ))}
              <td className={cn(tdBase, 'font-bold text-indigo-700')}>
                {formatValue(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
