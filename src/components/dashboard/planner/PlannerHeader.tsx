'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Copy, Wand2, CheckCheck, X, UtensilsCrossed, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Spinner } from '@/components/ui/Spinner';

interface Props {
  hasSuggestions: boolean;
  suggestPending: boolean;
  copyPending: boolean;
  lunchStart: string;
  lunchPending: boolean;
  pushPending: boolean;
  pullPending: boolean;
  hasUnsynced: boolean;
  hasNeedsPush: boolean;
  unsyncedCount: number;
  hasOutlookModified: boolean;
  onPushSync: () => void;
  onPullSync: () => void;
  onAcceptAll: () => void;
  onClearSuggestions: () => void;
  onSuggest: () => void;
  onCopy: () => void;
  onUpdateLunch: (time: string) => void;
}

export default function PlannerHeader({
  hasSuggestions, suggestPending, copyPending,
  lunchStart, lunchPending,
  pushPending, pullPending, hasUnsynced, hasNeedsPush, unsyncedCount, hasOutlookModified,
  onPushSync, onPullSync, onAcceptAll, onClearSuggestions, onSuggest, onCopy,
  onUpdateLunch,
}: Props) {
  const [lunchMenuOpen, setLunchMenuOpen] = useState(false);
  const lunchRef = useRef<HTMLDivElement>(null);

  // Click-outside for lunch dropdown
  useEffect(() => {
    if (!lunchMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (lunchRef.current && !lunchRef.current.contains(e.target as Node)) setLunchMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [lunchMenuOpen]);

  return (
    <div className="detail-hdr flex-shrink-0" data-el="L2 detail-hdr" data-el-cat="detail">
      <div className="flex items-center justify-end gap-0.5" style={{ padding: '8px 16px' }}>
        {hasSuggestions ? (
          <>
            <button onClick={onAcceptAll} title="Прийняти всі" className="cal-action-btn" aria-label="Прийняти всі" data-el="action · accept-all" data-el-cat="action">
              <CheckCheck className="h-3.5 w-3.5" />
            </button>
            <button onClick={onClearSuggestions} title="Очистити" className="cal-action-btn act-del" aria-label="Очистити" data-el="action · clear" data-el-cat="action">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <button onClick={onSuggest} disabled={suggestPending} title="AI Suggest" className="cal-action-btn" aria-label="AI Suggest" data-el="action · suggest" data-el-cat="action">
              {suggestPending ? <Spinner size="xs" /> : <Wand2 className="h-3.5 w-3.5" />}
            </button>
            <button onClick={onCopy} disabled={copyPending} title="Копіювати тиждень" className="cal-action-btn" aria-label="Копіювати тиждень" data-el="action · copy" data-el-cat="action">
              {copyPending ? <Spinner size="xs" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </>
        )}

        {/* Lunch */}
        <div className="relative" ref={lunchRef}>
          <button onClick={() => setLunchMenuOpen(v => !v)} title={`Обід: ${lunchStart}`} className="cal-action-btn" aria-label="Обід" data-el="action · lunch" data-el-cat="action">
            {lunchPending ? <Spinner size="xs" /> : <UtensilsCrossed className="h-3.5 w-3.5" />}
          </button>
          {lunchMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-40 element-card rounded-lg py-1 min-w-[80px]">
              {['12:00', '12:30', '13:00', '13:30'].map(t => (
                <button key={t} onClick={() => { onUpdateLunch(t); setLunchMenuOpen(false); }}
                  className={cn('w-full px-3 py-1 text-xs text-left hover:bg-slate-50 transition-colors', t === lunchStart ? 'text-amber-600 font-medium' : 'text-slate-600')}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Pull from Outlook */}
        <div className="relative">
          <button onClick={onPullSync} disabled={pullPending || !hasOutlookModified} title={hasOutlookModified ? 'Оновити з Outlook' : 'Немає змін в Outlook'}
            className={cn('cal-action-btn', hasOutlookModified && 'accent')} aria-label="Оновити з Outlook" data-el="action · pull" data-el-cat="action">
            {pullPending ? <Spinner size="xs" /> : <Download className="h-3.5 w-3.5" />}
          </button>
          {hasOutlookModified && !pullPending && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          )}
        </div>

        {/* Push to Outlook */}
        <div className="relative flex items-center gap-0.5">
          <button onClick={onPushSync} disabled={pushPending || (!hasUnsynced && !hasNeedsPush)} title={(hasUnsynced || hasNeedsPush) ? `Відправити в Outlook (${unsyncedCount})` : 'Немає змін для синхронізації'}
            className={cn('cal-action-btn', (hasUnsynced || hasNeedsPush) && 'accent')} aria-label="Відправити в Outlook" data-el="action · push" data-el-cat="action">
            {pushPending ? <Spinner size="xs" /> : <Upload className="h-3.5 w-3.5" />}
          </button>
          {hasUnsynced && !pushPending && (
            <span className="text-[9px] font-bold text-indigo-500">{unsyncedCount}</span>
          )}
        </div>
      </div>

      <div className="hdr-sep" />
    </div>
  );
}
