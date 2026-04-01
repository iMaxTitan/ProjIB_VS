'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, BookOpen, AlertCircle, ChevronDown, CornerDownRight } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/shared/utils';

// ── Types ───────────────────────────────────────────────────────────────────────

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
}

interface ConversationTurn { role: 'user' | 'assistant'; content: string; }

interface ChunkPreview {
  document_title: string;
  heading: string | null;
  content: string;
}

interface SearchResult {
  id: string;
  query: string;
  text: string;
  timestamp: Date;
  /** History that was sent WITH this query (previous turns). */
  history: ConversationTurn[];
  chunks?: ChunkPreview[];
}

const CATEGORIES = [
  { value: '',       label: 'Всі категорії' },
  { value: 'ib',     label: 'Інформаційна безпека' },
  { value: 'hr',     label: 'HR' },
  { value: 'it',     label: 'IT' },
  { value: 'legal',  label: 'Юридичний' },
];

// ── Source chunks panel ─────────────────────────────────────────────────────────

function SourceChunksPanel({ chunks }: { chunks: ChunkPreview[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={open ? 'Приховати уривки' : 'Показати уривки з документів'}
        className={cn(
          'flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-indigo-500',
          'transition-colors duration-base focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded',
        )}
      >
        <ChevronDown
          aria-hidden="true"
          className={cn('h-3 w-3 transition-transform duration-base', open && 'rotate-180')}
        />
        {open ? 'Приховати уривки' : `Уривки з документів (${chunks.length})`}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {chunks.map((chunk, i) => (
            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div className="flex items-baseline gap-1.5 mb-1.5 flex-wrap">
                <span className="text-[11px] font-medium text-indigo-700 leading-none">
                  📄 {chunk.document_title}
                </span>
                {chunk.heading && (
                  <span className="text-[10px] text-slate-400 leading-none">· {chunk.heading}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed whitespace-pre-line">
                {chunk.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Answer renderer ─────────────────────────────────────────────────────────────

function AnswerBlock({ text }: { text: string }) {
  const lines = text.split('\n');

  // Split off cost footer (🤖 line)
  const footerIdx = lines.findLastIndex(l => l.trim().startsWith('🤖'));
  const bodyLines = footerIdx >= 0 ? lines.slice(0, footerIdx) : [...lines];
  const footer = footerIdx >= 0 ? lines[footerIdx].trim() : null;

  // Separate sources section (📄 lines at the end)
  const firstSrcIdx = bodyLines.findIndex(l => l.trim().startsWith('📄'));
  const cutIdx = firstSrcIdx > 0 && !bodyLines[firstSrcIdx - 1].trim()
    ? firstSrcIdx - 1
    : firstSrcIdx;

  const mainHtml = (firstSrcIdx >= 0 ? bodyLines.slice(0, cutIdx) : bodyLines)
    .join('\n').trimEnd();
  const srcHtml = firstSrcIdx >= 0
    ? bodyLines.slice(firstSrcIdx).join('\n')
    : null;

  return (
    <div>
      {/* KB synthesis returns HTML with <b> tags — controlled server output */}
      <div
        className="kb-answer text-sm text-slate-800 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: mainHtml }}
      />
      {srcHtml && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div
            className="kb-sources text-[11px] text-slate-400 leading-loose"
            dangerouslySetInnerHTML={{ __html: srcHtml }}
          />
        </div>
      )}
      {footer && (
        <p className="mt-2 text-[11px] text-slate-400 font-mono">{footer}</p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

export default function KBSearchContent({ tabsSlot }: Props) {
  const [query, setQuery]       = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [results, setResults]   = useState<SearchResult[]>([]);
  const [followUp, setFollowUp] = useState<Record<string, string>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Scroll to results when new answer arrives
  useEffect(() => {
    if (results.length > 0) {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [results.length]);

  const doSearch = useCallback(async (
    q: string,
    history: ConversationTurn[],
    onStart: () => void,
    onDone: (text: string, chunks?: ChunkPreview[]) => void,
    onError: (msg: string) => void,
  ) => {
    onStart();
    try {
      const res = await fetch('/api/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query: q, category: category || undefined, history: history.length ? history : undefined }),
      });
      const data = await res.json();
      if (!res.ok) { onError(data.error ?? 'Помилка пошуку'); return; }
      onDone(data.text as string, data.chunks as ChunkPreview[] | undefined);
    } catch {
      onError('Не вдалось зʼєднатись із сервером');
    }
  }, [category]);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setError('');

    await doSearch(q, [], () => setLoading(true), (text, chunks) => {
      setResults(prev => [{
        id: crypto.randomUUID(),
        query: q, text, timestamp: new Date(), history: [], chunks,
      }, ...prev.slice(0, 9)]);
      setQuery('');
    }, (msg) => setError(msg));

    setLoading(false);
  };

  const handleFollowUp = async (result: SearchResult) => {
    const q = (followUp[result.id] ?? '').trim();
    if (!q || followLoading[result.id]) return;

    const history: ConversationTurn[] = [
      ...result.history,
      { role: 'user', content: result.query },
      { role: 'assistant', content: result.text },
    ];

    await doSearch(q, history,
      () => setFollowLoading(prev => ({ ...prev, [result.id]: true })),
      (text, chunks) => {
        setResults(prev => [{
          id: crypto.randomUUID(),
          query: q, text, timestamp: new Date(), history, chunks,
        }, ...prev.slice(0, 9)]);
        setFollowUp(prev => ({ ...prev, [result.id]: '' }));
        setFollowLoading(prev => ({ ...prev, [result.id]: false }));
      },
      () => setFollowLoading(prev => ({ ...prev, [result.id]: false })),
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {tabsSlot && <div className="flex-shrink-0">{tabsSlot}</div>}

      <div className="flex-1 overflow-y-auto">
        {/* ── Search form ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm px-4 sm:px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-3">

            {/* Textarea */}
            <div className="relative">
              <textarea
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Введіть питання до бази знань… (Enter — шукати, Shift+Enter — новий рядок)"
                aria-label="Питання до бази знань"
                disabled={loading}
                rows={2}
                className={cn(
                  'w-full resize-none px-4 py-3 pr-12',
                  'text-sm rounded-xl border border-slate-300',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'transition-[border-color,box-shadow] duration-base',
                )}
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Category selector */}
              <div className="relative flex-shrink-0">
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  aria-label="Фільтр за категорією"
                  disabled={loading}
                  className={cn(
                    'appearance-none pl-3 pr-8 py-2 text-sm',
                    'border border-slate-300 rounded-lg bg-white',
                    'focus:outline-none focus:ring-2 focus:ring-indigo-500',
                    'disabled:opacity-50 cursor-pointer',
                  )}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <ChevronDown
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none"
                  aria-hidden="true"
                />
              </div>

              {/* Search button */}
              <Button
                onClick={handleSearch}
                disabled={!query.trim() || loading}
                aria-label="Шукати в базі знань"
                className="gap-2"
              >
                {loading
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Search className="h-4 w-4" aria-hidden="true" />
                }
                <span className="hidden xs:inline">{loading ? 'Шукаємо…' : 'Шукати'}</span>
              </Button>

              {/* Clear history */}
              {results.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => setResults([])}
                  aria-label="Очистити результати"
                  className="text-slate-400 text-sm ml-auto"
                >
                  Очистити
                </Button>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* ── Results ── */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6" ref={resultsRef}>

          {/* Empty state */}
          {results.length === 0 && !loading && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center">
                <BookOpen className="h-7 w-7 text-indigo-400" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-700">Пошук в базі знань</p>
                <p className="text-sm text-slate-400 mt-1">
                  Задайте питання — отримайте відповідь на основі корпоративних документів
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {['Яка парольна політика?', 'Що таке DMZ?', 'Порядок звільнення'].map(hint => (
                  <button
                    key={hint}
                    onClick={() => setQuery(hint)}
                    className="text-xs px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-full transition-colors duration-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Result cards */}
          {results.map((result) => (
            <div
              key={result.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Query header */}
              <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50/60">
                <div className="flex items-start gap-2">
                  {result.history.length > 0
                    ? <CornerDownRight className="h-4 w-4 text-indigo-300 flex-shrink-0 mt-0.5" aria-hidden="true" />
                    : <Search className="h-4 w-4 text-indigo-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  }
                  <p className="text-sm font-medium text-slate-700 leading-snug">{result.query}</p>
                </div>
              </div>

              {/* Answer body */}
              <div className="px-4 sm:px-5 py-4">
                <AnswerBlock text={result.text} />
                {result.chunks && result.chunks.length > 0 && (
                  <SourceChunksPanel chunks={result.chunks} />
                )}
              </div>

              {/* Follow-up input */}
              <div className="px-4 sm:px-5 py-2.5 border-t border-slate-100 bg-slate-50/40">
                <div className="flex items-center gap-2">
                  <CornerDownRight className="h-3.5 w-3.5 text-slate-300 flex-shrink-0" aria-hidden="true" />
                  <input
                    type="text"
                    value={followUp[result.id] ?? ''}
                    onChange={e => setFollowUp(prev => ({ ...prev, [result.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleFollowUp(result); }}
                    placeholder="Уточнити запит…"
                    aria-label="Уточнюючий запит"
                    disabled={followLoading[result.id]}
                    className="flex-1 text-sm px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent disabled:opacity-50 transition-[border-color,box-shadow] duration-base"
                  />
                  <button
                    onClick={() => handleFollowUp(result)}
                    disabled={!followUp[result.id]?.trim() || followLoading[result.id]}
                    aria-label="Надіслати уточнення"
                    className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors duration-base focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {followLoading[result.id]
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      : <Search className="h-4 w-4" aria-hidden="true" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CSS for rendered HTML answer */}
      <style>{`
        .kb-answer { white-space: pre-line; }
        .kb-answer b { font-weight: 600; color: #111827; }
        .kb-answer i { font-style: italic; color: #4b5563; }
        .kb-answer a { color: #3b82f6; text-decoration: underline; text-underline-offset: 2px; }
        .kb-answer a:hover { color: #2563eb; }
        .kb-sources { white-space: pre-line; }
        .kb-sources a { color: #3b82f6; text-decoration: underline; text-underline-offset: 2px; }
        .kb-sources a:hover { color: #2563eb; }
      `}</style>
    </div>
  );
}
