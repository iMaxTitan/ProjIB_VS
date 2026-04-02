'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';
import { X } from 'lucide-react';
import { SummaryBox, pctColor } from '@/components/dashboard/shared';
import type { ViewLevel } from '@/hooks/usePlansV2';

// ── Constants ──

export const TAG_CLS = 'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium';
export const META_LABEL = 'flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1';

// ── Helpers ──

export function scopeHeaderLabel(viewLevel: ViewLevel, scopeLabel: string): string {
  if (viewLevel === 'year') return `Річний план · ${scopeLabel}`;
  if (viewLevel === 'quarter') return `Квартальний план · ${scopeLabel}`;
  return `Місячний план · ${scopeLabel}`;
}

// ── DetailHeader ──

export function DetailHeader({
  title,
  pct,
  departmentName,
  onClose,
}: {
  title: string;
  pct?: number;
  departmentName?: string | null;
  onClose?: () => void;
}) {
  return (
    <>
      <div className="detail-hdr flex items-center gap-2 px-3 py-2">
        <div className="w-1 h-5 rounded-sm bg-indigo-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-slate-700 line-clamp-1">{title}</div>
        </div>
        {departmentName && (
          <span className="px-2 py-0.5 rounded text-[9px] font-semibold bg-indigo-50 text-indigo-600 flex-shrink-0">
            {departmentName}
          </span>
        )}
        {pct != null && (
          <span className={cn('text-[10px] font-bold flex-shrink-0', pctColor(pct))}>
            {pct}%
          </span>
        )}
        {onClose && (
          <button onClick={onClose} className="cal-action-btn flex-shrink-0" title="Закрити" aria-label="Закрити">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="hdr-sep" />
    </>
  );
}

// ── InlineDropdown ──

export function InlineDropdown({ items, loading, onSelect, onClose }: {
  items: { id: string; label: string }[];
  loading: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = React.useState('');
  const filtered = filter ? items.filter(i => i.label.toLowerCase().includes(filter.toLowerCase())) : items;

  return (
    <div className="mt-1.5 border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-slate-100">
        <input
          autoFocus
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Пошук..."
          className="flex-1 text-[11px] bg-transparent outline-none placeholder-slate-400"
          aria-label="Фільтр"
        />
        <button onClick={onClose} className="cal-action-btn" aria-label="Закрити"><X className="w-3 h-3" /></button>
      </div>
      <div className="max-h-32 overflow-y-auto">
        {loading ? (
          <div className="px-2 py-2 text-[10px] text-slate-400 text-center">Завантаження...</div>
        ) : filtered.length === 0 ? (
          <div className="px-2 py-2 text-[10px] text-slate-400 text-center">Нічого не знайдено</div>
        ) : filtered.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="w-full text-left px-2 py-1.5 text-[11px] text-slate-700 hover:bg-indigo-50 transition-colors"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── SummaryFooter ──

export function SummaryFooter({ planned, spent, pct }: { planned: number; spent: number; pct: number }) {
  return (
    <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2.5 bg-slate-50 border-t border-slate-200">
      <SummaryBox label="Заплановано" value={`${planned} год`} />
      <SummaryBox label="Виконано" value={`${spent} год`} colorClass="text-emerald-600" />
      <SummaryBox label="Прогрес" value={`${pct}%`} colorClass={pctColor(pct)} />
    </div>
  );
}
