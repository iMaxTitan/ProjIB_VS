'use client';

import React, { useRef, useState } from 'react';
import {
  ShieldCheck,
  Upload,
  XCircle,
  FileText,
  Hash,
  Layers,
  Globe,
  Loader2,
  ArrowUpRight,
} from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import type { ValidationResult } from '@/lib/kb/validator';
import KBNormalizerPanel from './KBNormalizerPanel';
import KBValidatorChat from './KBValidatorChat';
import KBGuideCheckRow, { type DisplayCheck } from './KBGuideCheckRow';
import { ArtifactsNote, FixInstructionsPanel } from './KBValidatorPanels';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
  onRequestUpload?: () => void;
}

type PageState = 'idle' | 'loading' | 'result' | 'error';

// ─── Constants ─────────────────────────────────────────────────────────────────

const SCORE_BADGE = {
  ready:       { label: 'Готовий до індексації',    cls: 'bg-green-100 text-green-700' },
  minor_fixes: { label: 'Потребує незначних правок', cls: 'bg-amber-100 text-amber-700' },
  major_fixes: { label: 'Потребує суттєвих правок',  cls: 'bg-red-100 text-red-700' },
} as const;

const LANG_LABEL: Record<string, string> = {
  uk: 'Укр', ru: 'Рос', en: 'Англ', mixed: 'Змішана',
};

const ALLOWED_TYPES = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,text/markdown,.md';

/** Document Guide v2 checklist groups with ordered check IDs (structural + AI) */
const CHECK_GROUPS: Array<{ label: string; ids: string[] }> = [
  { label: 'Титульна сторінка',  ids: ['METADATA'] },
  { label: 'Структура',          ids: ['NO_HEADINGS', 'NO_HEADING_STYLES', 'NO_SUBHEADINGS', 'EMPTY_SECTIONS', 'THIN_SECTIONS', 'TOO_SHORT'] },
  { label: 'Зміст',              ids: ['CROSS_REFERENCES', 'ABBREVIATIONS_NOT_EXPANDED', 'abbreviations', 'numbers_in_text', 'MIXED_LANGUAGE'] },
  { label: 'Таблиці',            ids: ['TABLE_NO_HEADER', 'POOR_TABLE_QUALITY', 'table_captions'] },
  { label: 'Зміст (TOC)',        ids: ['TOC_REQUIRED', 'TOC_DETECTED'] },
  { label: 'Форматування',       ids: ['MANY_ARTIFACTS'] },
];

function buildCheckMap(result: ValidationResult): Map<string, DisplayCheck> {
  const map = new Map<string, DisplayCheck>();
  for (const c of result.checks) {
    map.set(c.id, { id: c.id, status: c.status, label: c.label, detail: c.detail, isAI: false });
  }
  for (const c of result.aiAnalysis.aiChecks) {
    map.set(c.id, { id: c.id, status: c.status, label: c.label, detail: c.note, isAI: true });
  }
  return map;
}

function StatPill({ icon, value, title }: { icon: React.ReactNode; value: string; title: string }) {
  return (
    <div
      title={title}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-full text-xs sm:text-sm text-slate-700 font-medium"
    >
      <span className="text-indigo-500">{icon}</span>
      {value}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function KBValidatorContent({ user, tabsSlot, onRequestUpload }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pageState, setPageState] = useState<PageState>('idle');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isChiefOrHead = user.role === 'chief' || user.role === 'head';

  // ── Access guard ──────────────────────────────────────────────────────────────

  if (!isChiefOrHead) {
    return (
      <div className="h-full flex flex-col overflow-hidden">
        {tabsSlot && <div className="flex-shrink-0">{tabsSlot}</div>}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center max-w-xs">
            <ShieldCheck className="h-10 w-10 text-slate-300" aria-hidden="true" />
            <p className="text-sm text-slate-500">
              Перевірка документів доступна лише для керівників
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSelectedFile(files[0]);
    setResult(null);
    setPageState('idle');
    setErrorMsg('');
  };

  const handleValidate = async () => {
    if (!selectedFile) return;
    setPageState('loading');
    setResult(null);
    setErrorMsg('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/kb/validate', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? 'Помилка сервера');
        setPageState('error');
        return;
      }

      setResult(data as ValidationResult);
      setPageState('result');
    } catch {
      setErrorMsg('Не вдалось зʼєднатись з сервером');
      setPageState('error');
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setResult(null);
    setPageState('idle');
    setErrorMsg('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  // Pre-compute checkMap outside JSX to avoid IIFE anti-pattern.
  const checkMap = pageState === 'result' && result ? buildCheckMap(result) : null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {tabsSlot && <div className="flex-shrink-0">{tabsSlot}</div>}

      <div className="flex-1 overflow-y-auto p-3 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4">

          {/* ── File picker ── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h2 className="text-sm sm:text-base font-semibold text-slate-800 mb-3">
              Перевірка документа
            </h2>

            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES}
              className="sr-only"
              aria-label="Оберіть документ для перевірки"
              onChange={(e) => handleFileChange(e.target.files)}
            />

            {/* Drop zone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Натисніть щоб обрати файл для перевірки"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileChange(e.dataTransfer.files);
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 py-6 px-4',
                'border-2 border-dashed rounded-lg cursor-pointer',
                'transition-colors duration-150',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
                selectedFile
                  ? 'border-indigo-300 bg-indigo-50/40'
                  : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50',
              )}
            >
              <Upload className="h-7 w-7 text-slate-400" aria-hidden="true" />
              {selectedFile ? (
                <div className="text-center">
                  <p className="text-sm font-medium text-indigo-700">{selectedFile.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {(selectedFile.size / 1024 / 1024).toFixed(1)} МБ · натисніть щоб змінити
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-sm text-slate-600">Натисніть або перетягніть файл</p>
                  <p className="text-xs text-slate-400 mt-0.5">DOCX (Word) або MD (Markdown) — до 20 МБ</p>
                </div>
              )}
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                onClick={handleValidate}
                disabled={!selectedFile || pageState === 'loading'}
                aria-label="Перевірити документ"
                className="gap-2"
              >
                {pageState === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden xs:inline">
                  {pageState === 'loading' ? 'Аналізуємо…' : 'Перевірити'}
                </span>
                <span className="xs:hidden">
                  {pageState === 'loading' ? '…' : 'Перевір.'}
                </span>
              </Button>

              {(selectedFile || result) && (
                <Button
                  variant="ghost"
                  onClick={handleReset}
                  aria-label="Скинути і обрати інший файл"
                  className="text-slate-500"
                >
                  Скинути
                </Button>
              )}
            </div>

            {pageState === 'loading' && (
              <p className="text-xs text-slate-400 mt-2">
                Аналіз може зайняти до 15 секунд…
              </p>
            )}
          </div>

          {/* ── Error state ── */}
          {pageState === 'error' && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <XCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {errorMsg}
            </div>
          )}

          {/* ── Results ── */}
          {pageState === 'result' && result && checkMap && (
            <>
              {/* Stats pills */}
              <div className="flex flex-wrap gap-2" role="region" aria-label="Статистика документа">
                <StatPill
                  icon={<FileText className="h-3.5 w-3.5" />}
                  value={`${result.stats.wordCount} слів`}
                  title="Кількість слів"
                />
                <StatPill
                  icon={<Hash className="h-3.5 w-3.5" />}
                  value={`${result.stats.sectionCount} розд.`}
                  title={`Розділів (H1): ${result.stats.sectionCount}, підрозділів (H2): ${result.stats.subsectionCount}`}
                />
                <StatPill
                  icon={<Layers className="h-3.5 w-3.5" />}
                  value={`${result.stats.parentChunks}→${result.stats.estimatedChunks} чанків`}
                  title={`${result.stats.parentChunks} батьківських (розділи) → ${result.stats.estimatedChunks} дочірніх чанків, ~${result.stats.avgChildrenPerParent} на розділ`}
                />
                <StatPill
                  icon={<Globe className="h-3.5 w-3.5" />}
                  value={LANG_LABEL[result.stats.language] ?? result.stats.language}
                  title="Мова документа"
                />
              </div>

              {/* Document Guide v2 — grouped checklist */}
              <div
                className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                role="region"
                aria-label="Чеклист Document Guide v2"
              >
                <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">Document Guide v2 — Чеклист</h3>
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    SCORE_BADGE[result.aiAnalysis.overallScore].cls,
                  )}>
                    {SCORE_BADGE[result.aiAnalysis.overallScore].label}
                  </span>
                </div>
                {CHECK_GROUPS.map(group => {
                  const items = group.ids
                    .map(id => checkMap.get(id))
                    .filter((c): c is DisplayCheck => c != null);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <p className="px-4 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50/80 border-b border-slate-100">
                        {group.label}
                      </p>
                      {items.map(check => (
                        <KBGuideCheckRow
                          key={check.id}
                          check={check}
                          preview={result.preview}
                          fileName={selectedFile?.name ?? ''}
                        />
                      ))}
                    </div>
                  );
                })}
                <ArtifactsNote hasArtifacts={result.stats.hasArtifacts} />
              </div>

              {/* AI Summary + Recommendations */}
              {(result.aiAnalysis.summary || result.aiAnalysis.recommendations.length > 0) && (
                <div
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                  role="region"
                  aria-label="AI-висновок"
                >
                  <div className="px-4 py-3 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-800">🤖 AI-висновок</span>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    {result.aiAnalysis.summary && (
                      <p className="text-sm text-slate-700">{result.aiAnalysis.summary}</p>
                    )}
                    {result.aiAnalysis.recommendations.length > 0 && (
                      <ul className="space-y-1.5 pt-1">
                        {result.aiAnalysis.recommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                            <span className="text-indigo-400 font-bold flex-shrink-0 mt-0.5">•</span>
                            {rec}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <FixInstructionsPanel fixInstructions={result.aiAnalysis.fixInstructions} />
                </div>
              )}

              {/* AI Normalizer */}
              {selectedFile && (
                <KBNormalizerPanel
                  result={result}
                  fileName={selectedFile.name}
                  selectedFile={selectedFile}
                />
              )}

              {/* Mini Chat */}
              <KBValidatorChat result={result} fileName={selectedFile?.name ?? ''} />

              {/* CTA — only if ready to index */}
              {result.readyToIndex && onRequestUpload && (
                <div className="flex justify-end">
                  <Button
                    onClick={onRequestUpload}
                    aria-label="Перейти до завантаження цього документа"
                    className="gap-2"
                  >
                    Завантажити цей документ
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
