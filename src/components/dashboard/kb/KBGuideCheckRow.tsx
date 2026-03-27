'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/shared/utils';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface DisplayCheck {
  id: string;
  status: 'ok' | 'error' | 'warning' | 'info';
  label: string;
  detail: string;
  isAI: boolean;
}

interface Props {
  check: DisplayCheck;
  preview: string;
  fileName: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok:      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" aria-hidden="true" />,
  error:   <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" aria-hidden="true" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" aria-hidden="true" />,
  info:    <Info className="h-4 w-4 text-blue-400 flex-shrink-0" aria-hidden="true" />,
};

/** Check IDs where AI fix generation makes sense */
const FIXABLE_CHECKS = new Set([
  'METADATA', 'NO_HEADINGS', 'NO_HEADING_STYLES', 'NO_SUBHEADINGS', 'EMPTY_SECTIONS', 'THIN_SECTIONS',
  'TOO_SHORT', 'CROSS_REFERENCES', 'ABBREVIATIONS_NOT_EXPANDED', 'abbreviations', 'numbers_in_text',
  'TABLE_NO_HEADER', 'POOR_TABLE_QUALITY', 'table_captions',
]);

/** Parse {{+}}...{{/+}} markers into segments for highlighted rendering */
function parseFixHighlights(text: string): Array<{ text: string; added: boolean }> {
  const segments: Array<{ text: string; added: boolean }> = [];
  let remaining = text;
  while (remaining.length > 0) {
    const start = remaining.indexOf('{{+}}');
    if (start === -1) {
      segments.push({ text: remaining, added: false });
      break;
    }
    if (start > 0) segments.push({ text: remaining.slice(0, start), added: false });
    const end = remaining.indexOf('{{/+}}', start + 5);
    if (end === -1) {
      segments.push({ text: remaining.slice(start + 5), added: true });
      break;
    }
    segments.push({ text: remaining.slice(start + 5, end), added: true });
    remaining = remaining.slice(end + 6);
  }
  return segments;
}

/** Strip {{+}} / {{/+}} markers for clean copy */
function stripMarkers(text: string): string {
  return text.replace(/\{\{\+\}\}/g, '').replace(/\{\{\/\+\}\}/g, '');
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function KBGuideCheckRow({ check, preview, fileName }: Props) {
  const [fixText, setFixText] = useState<string | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const canFix = check.status !== 'ok' && FIXABLE_CHECKS.has(check.id);

  const handleRequestFix = async () => {
    if (fixText) {
      setFixOpen(v => !v);
      return;
    }

    setFixLoading(true);
    setFixOpen(true);
    try {
      const res = await fetch('/api/kb/validate/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkId: check.id,
          label: check.label,
          detail: check.detail,
          preview,
          fileName,
        }),
      });
      const data = await res.json();
      if (res.ok && data.fix) {
        setFixText(data.fix);
      } else {
        setFixText(`Помилка: ${data.error || 'невідома помилка'}`);
      }
    } catch {
      setFixText('Не вдалось зʼєднатись з сервером');
    } finally {
      setFixLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!fixText) return;
    await navigator.clipboard.writeText(stripMarkers(fixText));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'border-b border-slate-100 last:border-0',
      check.status === 'error'   && 'bg-red-50/50',
      check.status === 'warning' && 'bg-amber-50/40',
    )}>
      <div className="flex items-start gap-3 px-4 py-2.5">
        <span className="mt-0.5">{STATUS_ICON[check.status]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{check.label}</span>
            {check.isAI && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-indigo-50 text-indigo-500 rounded-full leading-none">
                AI
              </span>
            )}
          </div>
          {check.detail && (
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 leading-snug">{check.detail}</p>
          )}
        </div>
        {canFix && (
          <button
            onClick={handleRequestFix}
            disabled={fixLoading}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 mt-0.5',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
              fixText
                ? 'text-indigo-600 hover:bg-indigo-50'
                : 'text-indigo-500 bg-indigo-50 hover:bg-indigo-100',
            )}
            aria-label={fixText ? 'Показати/сховати виправлення' : 'Згенерувати виправлення'}
          >
            {fixLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : fixText ? (
              fixOpen
                ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {fixLoading ? 'Генерую…' : fixText ? 'Виправлення' : 'Виправити'}
            </span>
          </button>
        )}
      </div>

      {/* Fix result panel */}
      {fixOpen && fixText && (
        <div className="px-4 pb-3 pt-0.5">
          <div className="relative bg-white border border-indigo-100 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Копіювати виправлення"
            >
              {copied
                ? <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                : <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              }
            </button>
            {parseFixHighlights(fixText).map((seg, i) =>
              seg.added ? (
                <mark key={i} className="bg-green-100 text-green-800 rounded px-0.5">{seg.text}</mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
