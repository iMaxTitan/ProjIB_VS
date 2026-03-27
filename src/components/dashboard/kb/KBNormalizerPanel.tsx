'use client';

import React, { useState } from 'react';
import {
  Wand2, Download, ChevronDown, ChevronUp, Loader2,
  CheckCircle2, AlertTriangle, XCircle, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/badge';
import type { ValidationResult, ValidationCheck } from '@/lib/kb/validator';
import type { NormalizationResult } from '@/lib/kb/normalizer';
import KBNormalizerIndexForm from './KBNormalizerIndexForm';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  result: ValidationResult;
  fileName: string;
  selectedFile: File;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<string, React.ReactNode> = {
  ok:      <CheckCircle2  className="h-3.5 w-3.5 text-green-500 flex-shrink-0" aria-hidden="true" />,
  error:   <XCircle       className="h-3.5 w-3.5 text-red-500 flex-shrink-0"   aria-hidden="true" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" aria-hidden="true" />,
  info:    <Info          className="h-3.5 w-3.5 text-blue-400 flex-shrink-0"  aria-hidden="true" />,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function ChangesPanel({ changes }: { changes: string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-t border-slate-100">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={open ? 'Згорнути список змін' : 'Розгорнути список змін'}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-inset"
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
          <span className="text-sm font-medium text-slate-700">Що змінено ({changes.length})</span>
        </div>
        {open
          ? <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden="true" />
          : <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
        }
      </button>
      {open && (
        <ol className="px-4 pb-3 pt-1 space-y-1.5">
          {changes.map((change, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="text-indigo-400 font-semibold flex-shrink-0 w-5">{i + 1}.</span>
              {change}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MiniChecklist({ checks }: { checks: ValidationCheck[] }) {
  const issues = checks.filter(c => c.status === 'error' || c.status === 'warning');
  const okCount = checks.filter(c => c.status === 'ok').length;
  return (
    <div className="border-t border-slate-100 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
        Перевірка нормалізованого тексту
      </p>
      {issues.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 text-green-500" aria-hidden="true" />
          Усі структурні перевірки пройдено ({okCount})
        </div>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1.5">
          {issues.map(check => (
            <li key={check.id} className="flex items-start gap-2">
              <span className="mt-0.5">{STATUS_ICON[check.status]}</span>
              <div>
                <span className="text-sm font-medium text-slate-700">{check.label}</span>
                {check.detail && <p className="text-xs text-slate-500">{check.detail}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KBNormalizerPanel({ result, fileName, selectedFile }: Props) {
  const [normalizeState, setNormalizeState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [normResult, setNormResult] = useState<NormalizationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [indexedChunks, setIndexedChunks] = useState<number | null>(null);

  const handleNormalize = async () => {
    setNormalizeState('loading');
    setNormResult(null);
    setErrorMsg('');
    setIndexedChunks(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('checksJson', JSON.stringify(result.checks));
      formData.append('aiChecksJson', JSON.stringify(result.aiAnalysis.aiChecks));

      const res = await fetch('/api/kb/validate/normalize', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(data.error ?? 'Помилка сервера'); setNormalizeState('error'); return; }
      setNormResult(data as NormalizationResult);
      setNormalizeState('done');
    } catch {
      setErrorMsg('Не вдалось зʼєднатись з сервером');
      setNormalizeState('error');
    }
  };

  const handleDownload = async () => {
    if (!normResult) return;
    setDownloading(true);
    try {
      const res = await fetch('/api/kb/validate/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ normalizedText: normResult.normalizedText, fileName }),
      });
      if (!res.ok) { const d = await res.json(); setErrorMsg(d.error ?? 'Помилка'); return; }
      const blob = await res.blob();
      const baseName = fileName.replace(/\.docx$/i, '');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `normalized-${baseName}.docx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMsg('Не вдалось завантажити файл');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      role="region"
      aria-label="AI-нормалізація та індексація"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-indigo-500" aria-hidden="true" />
        <span className="text-sm font-semibold text-slate-800">AI-нормалізація</span>
        {normalizeState === 'done' && indexedChunks === null && (
          <Badge variant="success" className="ml-auto">Нормалізовано</Badge>
        )}
        {indexedChunks !== null && (
          <Badge variant="indigo" className="ml-auto">В КБ · {indexedChunks} чанків</Badge>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-slate-600">
          AI виправляє усі порушення Document Guide v2. Після нормалізації — перевірка
          та можливість одразу додати до бази знань.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {normalizeState !== 'done' && (
            <Button
              onClick={handleNormalize}
              disabled={normalizeState === 'loading'}
              aria-label="Запустити AI-нормалізацію документа"
              className="gap-2"
            >
              {normalizeState === 'loading'
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Wand2 className="h-4 w-4" aria-hidden="true" />
              }
              <span className="hidden xs:inline">
                {normalizeState === 'loading' ? 'Нормалізуємо…' : 'Нормалізувати документ'}
              </span>
              <span className="xs:hidden">{normalizeState === 'loading' ? '…' : 'Нормалізувати'}</span>
            </Button>
          )}

          {normalizeState === 'done' && normResult && (
            <>
              <Button onClick={handleNormalize} variant="outline" aria-label="Нормалізувати ще раз" className="gap-2">
                <Wand2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden xs:inline">Повторити</span>
              </Button>
              <Button onClick={handleDownload} disabled={downloading} variant="outline" aria-label="Завантажити DOCX" className="gap-2">
                {downloading
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Download className="h-4 w-4" aria-hidden="true" />
                }
                <span className="hidden xs:inline">{downloading ? 'Завантаження…' : 'Завантажити DOCX'}</span>
                <span className="xs:hidden">DOCX</span>
              </Button>
            </>
          )}
        </div>

        {normalizeState === 'loading' && (
          <p className="text-xs text-slate-400">Нормалізація може зайняти до 3 хвилин…</p>
        )}
        {(normalizeState === 'error' || (errorMsg && normalizeState !== 'done')) && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-red-50 border border-red-200 text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            {errorMsg || 'Помилка нормалізації'}
          </div>
        )}
        {normalizeState === 'done' && normResult && (
          <p className="text-xs text-slate-400">
            🤖 claude-sonnet-4-6 · {normResult.usage.total_tokens.toLocaleString()} токенів
          </p>
        )}
      </div>

      {/* Truncation warning */}
      {normalizeState === 'done' && normResult?.wasTextTruncated && (
        <div className="border-t border-amber-100 bg-amber-50/50 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
          <span>
            Документ великий — нормалізовано перші ~13 000 слів. Решта залишилась без змін.
            Розбийте документ на частини для повної обробки.
          </span>
        </div>
      )}

      {/* Changes */}
      {normalizeState === 'done' && normResult && normResult.changes.length > 0 && (
        <ChangesPanel changes={normResult.changes} />
      )}

      {/* Structural check of normalized text */}
      {normalizeState === 'done' && normResult && (
        <MiniChecklist checks={normResult.structuralCheck.checks} />
      )}

      {/* Index form (includes test queries after indexing) — only if passes structural check */}
      {normalizeState === 'done' && normResult && normResult.structuralCheck.readyToIndex && indexedChunks === null && (
        <KBNormalizerIndexForm
          fileName={fileName}
          normResult={normResult}
          onIndexed={(_id, chunkCount) => setIndexedChunks(chunkCount ?? null)}
          onError={msg => setErrorMsg(msg)}
        />
      )}

      {/* Fails structural check — no index button */}
      {normalizeState === 'done' && normResult && !normResult.structuralCheck.readyToIndex && (
        <div className="border-t border-amber-100 bg-amber-50/50 px-4 py-3 flex items-start gap-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" aria-hidden="true" />
          <span>
            Нормалізований текст ще має помилки. Завантажте DOCX, виправте вручну та повторно перевірте.
          </span>
        </div>
      )}
    </div>
  );
}
