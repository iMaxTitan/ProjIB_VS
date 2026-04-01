'use client';

import React from 'react';
import { RefreshCw, ChevronDown, ChevronRight, ExternalLink, Loader2, AlertCircle, CheckCircle2, Search, FilePlus } from 'lucide-react';
import { useLawLibrary, type LawDoc, type UpdateStatus, type CompletenessResult } from '@/hooks/useLawLibrary';
import { Badge } from '@/components/ui/badge';

const STAGE_LABELS: Record<string, string> = {
  chunking: 'Чанкінг…',
  prefix: 'Контекст…',
  embedding: 'Ембеддінг…',
};

function stageLabel(stage?: string): string {
  return (stage && STAGE_LABELS[stage]) || 'Обробка…';
}

function StatusIndicator({ status }: { status?: UpdateStatus }) {
  if (!status || status === 'unknown') return <span className="h-2.5 w-2.5 rounded-full bg-slate-300" title="Не перевірено" />;
  if (status === 'checking') return <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />;
  if (status === 'current') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === 'outdated') return <AlertCircle className="h-3.5 w-3.5 text-amber-500" />;
  return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
}

function docTypeBadge(docType?: string): 'blue' | 'indigo' | 'amber' | 'emerald' | 'slate' {
  if (!docType) return 'slate';
  if (docType.includes('Постанова')) return 'indigo';
  if (docType.includes('Наказ')) return 'amber';
  if (docType.includes('Указ')) return 'emerald';
  if (docType.includes('Закон') || docType.includes('Кодекс')) return 'blue';
  return 'slate';
}

function CompletenessInfo({ result }: { result: CompletenessResult }) {
  if (result.missing.length === 0) {
    return (
      <span className="text-xs text-emerald-600 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> Повна ({result.present}/{result.total})
      </span>
    );
  }
  return (
    <div className="px-3 py-2 bg-amber-50 border-t border-amber-100">
      <p className="text-xs font-medium text-amber-700 mb-1">
        Відсутні в KB ({result.missing.length} з {result.total}):
      </p>
      <ul className="space-y-0.5">
        {result.missing.map(m => (
          <li key={m.url} className="text-xs text-amber-600 flex items-center gap-1">
            <span className="font-mono text-amber-500">{m.docNumber || '—'}</span>
            <span className="truncate">{m.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LawRow({ doc, depth, updateStatuses, completeness, onCheckCompleteness, onAddChild }: {
  doc: LawDoc; depth: number; updateStatuses: Record<string, UpdateStatus>;
  completeness: Record<string, CompletenessResult | 'checking'>;
  onCheckCompleteness: (docId: string) => void;
  onAddChild?: (doc: { id: string; title: string }) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const hasChildren = doc.children && doc.children.length > 0;
  const status = updateStatuses[doc.id];
  const compStatus = completeness[doc.id];

  return (
    <>
      <tr className="group hover:bg-slate-50/50 transition-colors">
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} className="p-0.5 rounded hover:bg-slate-200 transition-colors">
                {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
              </button>
            ) : (
              <span className="w-4.5" />
            )}
            <span className="text-sm text-slate-800 truncate max-w-md" title={doc.title}>{doc.title}</span>
          </div>
        </td>
        <td className="py-2.5 px-3">
          <Badge variant={docTypeBadge(doc.metadata?.doc_type)} size="sm">{doc.metadata?.doc_type || '—'}</Badge>
        </td>
        <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{doc.metadata?.doc_number || '—'}</td>
        <td className="py-2.5 px-3 text-xs text-slate-500">{doc.metadata?.fetched_at || doc.created_at?.split('T')[0] || '—'}</td>
        <td className="py-2.5 px-3 text-xs text-slate-500">
          {doc.status === 'processing' ? (
            <span className="inline-flex items-center gap-1 text-blue-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              {stageLabel(doc.metadata?.processing_stage)}
            </span>
          ) : (
            doc.chunk_count || 0
          )}
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            <StatusIndicator status={status} />
            {status === 'outdated' && (
              <span className="text-xs text-amber-600 font-medium">Оновити</span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            {onAddChild && (
              <button
                onClick={() => onAddChild({ id: doc.id, title: doc.title })}
                className="text-slate-400 hover:text-emerald-600 transition-colors"
                title="Додати дочірній документ"
              >
                <FilePlus className="h-3.5 w-3.5" />
              </button>
            )}
            {depth === 0 && doc.metadata?.source_url && (
              compStatus === 'checking' ? (
                <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin" />
              ) : (
                <button
                  onClick={() => onCheckCompleteness(doc.id)}
                  className="text-slate-400 hover:text-indigo-600 transition-colors"
                  title="Перевірити повноту пов'язаних актів"
                >
                  <Search className="h-3.5 w-3.5" />
                </button>
              )
            )}
            {doc.metadata?.source_url && (
              <a
                href={doc.metadata.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-700 transition-colors"
                title="Відкрити на zakon.rada.gov.ua"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </td>
      </tr>
      {depth === 0 && compStatus && compStatus !== 'checking' && (
        <tr><td colSpan={7} className="p-0"><CompletenessInfo result={compStatus} /></td></tr>
      )}
      {expanded && hasChildren && doc.children.map(child => (
        <LawRow key={child.id} doc={child} depth={depth + 1} updateStatuses={updateStatuses} completeness={completeness} onCheckCompleteness={onCheckCompleteness} onAddChild={onAddChild} />
      ))}
    </>
  );
}

export default function LawLibraryTable({ onAddChild }: { onAddChild?: (doc: { id: string; title: string }) => void } = {}) {
  const { laws, isLoading, error, updateStatuses, completeness, checkAllUpdates, checkCompleteness } = useLawLibrary();
  const [checking, setChecking] = React.useState(false);

  const handleCheckAll = async () => {
    setChecking(true);
    await checkAllUpdates();
    setChecking(false);
  };

  if (isLoading) {
    return (
      <div className="element-card p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Завантаження...
      </div>
    );
  }

  if (error) {
    return <div className="element-card p-4 text-sm text-red-600">{error}</div>;
  }

  return (
    <div className="element-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-medium text-slate-700">
          Бібліотека законодавства ({laws.length})
        </h3>
        <button
          onClick={handleCheckAll}
          disabled={checking || laws.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 transition-colors"
        >
          {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Перевірити оновлення
        </button>
      </div>

      {laws.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">
          Немає імпортованих законів. Скористайтеся пошуком вище.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500">Назва</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500">Тип</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500">Номер</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500">Завантажено</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500">Чанки</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500">Статус</th>
                <th className="py-2 px-3 text-left text-xs font-medium text-slate-500 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {laws.map(law => (
                <LawRow key={law.id} doc={law} depth={0} updateStatuses={updateStatuses} completeness={completeness} onCheckCompleteness={checkCompleteness} onAddChild={onAddChild} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
