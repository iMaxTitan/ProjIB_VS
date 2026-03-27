'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Database, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/shared/utils';
import type { NormalizationResult } from '@/lib/kb/normalizer';

// ── Types ─────────────────────────────────────────────────────────────────────

interface KBCategory { id: string; name: string; icon: string; }
type IndexState = 'idle' | 'submitting' | 'polling' | 'indexed' | 'index_error';

interface Props {
  fileName: string;
  normResult: NormalizationResult;
  onIndexed: (documentId: string, chunkCount: number | undefined) => void;
  onError: (msg: string) => void;
}

// ── Test queries (shown after indexing) ──────────────────────────────────────

function extractH1Headings(text: string, max = 3): string[] {
  const headings: string[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(/^# (.+)/);
    if (m) {
      const h = m[1].replace(/^\d+\.\s*/, '').trim();
      if (h && !h.startsWith('[')) headings.push(h);
      if (headings.length >= max) break;
    }
  }
  return headings;
}

function buildTestQueries(headings: string[], docTitle: string): string[] {
  if (headings.length === 0) return [`Що містить документ «${docTitle}»?`];
  return headings.map(h => `Що описує розділ «${h}»?`);
}

interface TestQueriesPanelProps { queries: string[] }

function TestQueriesPanel({ queries }: TestQueriesPanelProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (q: string) => {
    navigator.clipboard.writeText(q).then(() => {
      setCopied(q);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <div className="border-t border-green-100 bg-green-50/40 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-green-800 uppercase tracking-wide flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5" aria-hidden="true" />
        Тестові запити до КБ
      </p>
      <p className="text-xs text-green-700">
        Спробуйте ці запити в боті або чаті KB, щоб перевірити що документ проіндексовано:
      </p>
      <ul className="space-y-1.5">
        {queries.map((q, i) => (
          <li key={i}>
            <button
              onClick={() => copy(q)}
              aria-label={`Копіювати запит: ${q}`}
              className={cn(
                'w-full text-left text-sm px-3 py-1.5 rounded-lg border transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-green-500',
                copied === q
                  ? 'bg-green-200 border-green-300 text-green-900'
                  : 'bg-white border-green-200 text-slate-700 hover:bg-green-100 hover:border-green-300',
              )}
            >
              <span className="font-mono text-xs text-green-600 mr-2">{i + 1}.</span>
              {q}
              {copied === q && (
                <span className="ml-2 text-xs text-green-600 font-medium">скопійовано ✓</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KBNormalizerIndexForm({ fileName, normResult, onIndexed, onError }: Props) {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState(() => fileName.replace(/\.docx$/i, '').replace(/_/g, ' '));
  const [indexState, setIndexState] = useState<IndexState>('idle');
  const [testQueries, setTestQueries] = useState<string[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/kb/categories')
      .then(r => r.json())
      .then((data: KBCategory[]) => {
        setCategories(data);
        if (data.length > 0) setCategoryId(data[0].id);
      })
      .catch(() => {/* non-fatal */});
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = (documentId: string) => {
    setIndexState('polling');
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > 30) {
        clearInterval(pollRef.current!);
        onError('Індексація зайняла занадто довго');
        return;
      }
      try {
        const res = await fetch(`/api/kb/documents/${documentId}`);
        const data = await res.json();
        if (data.status === 'ready') {
          clearInterval(pollRef.current!);
          setIndexState('indexed');
          const docTitle = fileName.replace(/\.docx$/i, '');
          const headings = extractH1Headings(normResult.normalizedText);
          setTestQueries(buildTestQueries(headings, docTitle));
          onIndexed(documentId, data.chunk_count);
        } else if (data.status === 'error') {
          clearInterval(pollRef.current!);
          onError(data.error_message ?? 'Помилка індексації');
          setIndexState('index_error');
        }
      } catch {/* keep polling */}
    }, 2000);
  };

  const handleIndex = async () => {
    if (!categoryId || !title.trim()) return;
    setIndexState('submitting');
    try {
      const res = await fetch('/api/kb/validate/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalizedText: normResult.normalizedText,
          title: title.trim(),
          categoryId,
          sourceFileName: fileName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error ?? 'Помилка сервера');
        setIndexState('idle');
        return;
      }
      startPolling(data.documentId);
    } catch {
      onError('Не вдалось зʼєднатись з сервером');
      setIndexState('idle');
    }
  };

  if (indexState === 'polling') {
    return (
      <div className="border-t border-slate-100 px-4 py-3 flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" aria-hidden="true" />
        Індексуємо — чанкування та ембединг…
      </div>
    );
  }

  if (indexState === 'indexed') {
    return testQueries.length > 0 ? <TestQueriesPanel queries={testQueries} /> : null;
  }

  return (
    <div className="border-t border-indigo-100 bg-indigo-50/40 px-4 py-3 space-y-3">
      <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
        <Database className="h-3.5 w-3.5" aria-hidden="true" />
        Додати до бази знань
      </p>

      <div className="space-y-1">
        <label htmlFor="norm-category" className="text-xs font-medium text-slate-600">Категорія</label>
        <select
          id="norm-category"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          disabled={indexState === 'submitting' || categories.length === 0}
          aria-label="Оберіть категорію документа"
          className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white disabled:opacity-50"
        >
          {categories.length === 0 && <option value="">Завантаження…</option>}
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label htmlFor="norm-title" className="text-xs font-medium text-slate-600">Заголовок документа</label>
        <input
          id="norm-title"
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={indexState === 'submitting'}
          placeholder="Назва документа в КБ"
          aria-label="Заголовок документа в базі знань"
          className="w-full text-sm px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
        />
      </div>

      <Button
        onClick={handleIndex}
        disabled={indexState === 'submitting' || !categoryId || !title.trim()}
        aria-label="Індексувати нормалізований документ у базі знань"
        className="gap-2 w-full sm:w-auto"
      >
        {indexState === 'submitting'
          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          : <Database className="h-4 w-4" aria-hidden="true" />
        }
        {indexState === 'submitting' ? 'Створюємо документ…' : 'Індексувати в КБ'}
      </Button>
    </div>
  );
}
