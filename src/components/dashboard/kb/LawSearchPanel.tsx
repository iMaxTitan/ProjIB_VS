'use client';

import React, { useState, useMemo } from 'react';
import { Link2, FileText, Loader2, Check, BookOpen, FileEdit, ScrollText, Paperclip } from 'lucide-react';
import { useLawSearch, type LawRelatedResult } from '@/hooks/useLawSearch';
import { Badge } from '@/components/ui/badge';

interface Props {
  onImport: (items: { url: string; title: string; docType: string; docNumber: string }[]) => void;
  importing: boolean;
  canImport?: boolean;
}

type RelatedFilter = 'main' | 'changes' | 'all';

interface GroupedRelated {
  label: string;
  icon: React.ReactNode;
  badge: 'blue' | 'indigo' | 'amber' | 'slate';
  items: LawRelatedResult[];
}

function classifyAndGroup(related: LawRelatedResult[], filter: RelatedFilter): GroupedRelated[] {
  // Classify each item into a category
  const changes: LawRelatedResult[] = [];
  const laws: LawRelatedResult[] = [];
  const resolutions: LawRelatedResult[] = [];
  const orders: LawRelatedResult[] = [];
  const other: LawRelatedResult[] = [];

  for (const r of related) {
    const t = r.title.toLowerCase();
    const dt = r.docType.toLowerCase();

    const isChange = t.includes('внесення змін') || t.includes('зміни до') || dt.includes('зміни');
    const isLaw = dt.includes('закон') || dt.includes('кодекс');
    const isResolution = dt.includes('постанова') || dt.includes('розпорядження');
    const isOrder = dt.includes('наказ');

    if (filter === 'changes' && !isChange) continue;
    if (filter === 'main' && (isChange || (!isLaw && !isResolution && !isOrder))) continue;

    if (isChange) changes.push(r);
    else if (isLaw) laws.push(r);
    else if (isResolution) resolutions.push(r);
    else if (isOrder) orders.push(r);
    else other.push(r);
  }

  const groups: GroupedRelated[] = [];
  if (laws.length > 0) groups.push({
    label: 'Закони та кодекси',
    icon: <BookOpen className="h-3.5 w-3.5" />,
    badge: 'blue',
    items: laws,
  });
  if (changes.length > 0) groups.push({
    label: 'Зміни до закону',
    icon: <FileEdit className="h-3.5 w-3.5" />,
    badge: 'amber',
    items: changes,
  });
  if (resolutions.length > 0) groups.push({
    label: 'Постанови КМУ (порядки, правила)',
    icon: <ScrollText className="h-3.5 w-3.5" />,
    badge: 'indigo',
    items: resolutions,
  });
  if (orders.length > 0) groups.push({
    label: 'Накази (регламенти, критерії)',
    icon: <FileEdit className="h-3.5 w-3.5" />,
    badge: 'amber',
    items: orders,
  });
  if (other.length > 0) groups.push({
    label: 'Інші пов\'язані акти',
    icon: <Paperclip className="h-3.5 w-3.5" />,
    badge: 'slate',
    items: other,
  });
  return groups;
}

const FILTER_TABS: { id: RelatedFilter; label: string }[] = [
  { id: 'main', label: 'Основні' },
  { id: 'changes', label: 'Зміни' },
  { id: 'all', label: 'Усі' },
];

export default function LawSearchPanel({ onImport, importing, canImport = true }: Props) {
  const { results, related, searching, loadingRelated, error, search, fetchRelated, clear } = useLawSearch();
  const [input, setInput] = useState('');
  const [selectedRelated, setSelectedRelated] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<RelatedFilter>('main');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length < 3) return;
    setSelectedRelated(new Set());
    setFilter('main');
    search(trimmed);
  };

  const doc = results[0] || null;
  const docLoaded = doc && !searching;

  React.useEffect(() => {
    if (docLoaded && doc) {
      fetchRelated(doc.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docLoaded, doc?.url]);

  const groups = useMemo(() => classifyAndGroup(related, filter), [related, filter]);
  const totalFiltered = groups.reduce((s, g) => s + g.items.length, 0);

  const toggleRelated = (url: string) => {
    setSelectedRelated(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  };

  const selectAllInGroup = (items: LawRelatedResult[]) => {
    setSelectedRelated(prev => {
      const next = new Set(prev);
      const allSelected = items.every(i => next.has(i.url));
      if (allSelected) {
        items.forEach(i => next.delete(i.url));
      } else {
        items.forEach(i => next.add(i.url));
      }
      return next;
    });
  };

  const handleImport = () => {
    if (!doc) return;
    const items: { url: string; title: string; docType: string; docNumber: string }[] = [
      { url: doc.url, title: doc.title, docType: 'Закон України', docNumber: doc.docId },
    ];
    related
      .filter(r => selectedRelated.has(r.url))
      .forEach(r => items.push({ url: r.url, title: r.title, docType: r.docType, docNumber: r.docNumber || '' }));
    onImport(items);
    clear();
    setInput('');
  };

  const handleReset = () => {
    clear();
    setInput('');
    setSelectedRelated(new Set());
    setFilter('main');
  };

  return (
    <div className="element-card p-4 space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Вставте посилання з zakon.rada.gov.ua або номер (1023-XII, 3543-12)"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white/80 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={searching || input.trim().length < 3}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Завантажити'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {doc && !searching && (
        <div className="space-y-3">
          {/* Main document */}
          <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
            <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span className="flex-1 text-sm font-medium text-blue-900">
              {doc.docId && <span className="font-mono text-blue-600 mr-1.5">{doc.docId}</span>}
              {doc.title}
            </span>
            <Badge variant="blue" size="sm">Основний</Badge>
          </div>

          {/* Loading related */}
          {loadingRelated && (
            <div className="flex items-center gap-2 text-sm text-slate-500 px-1">
              <Loader2 className="h-4 w-4 animate-spin" />
              Пошук пов&apos;язаних актів (постанови, накази, зміни)...
            </div>
          )}

          {/* Filter tabs + grouped related */}
          {related.length > 0 && !loadingRelated && (
            <div className="space-y-2">
              {/* Filter tabs */}
              <div className="flex items-center gap-1">
                {FILTER_TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      filter === tab.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
                <span className="ml-auto text-xs text-slate-400">
                  {totalFiltered} з {related.length} актів
                </span>
              </div>

              {/* Grouped list */}
              {groups.length === 0 ? (
                <p className="text-xs text-slate-400 px-1">Немає актів у цій категорії</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {groups.map(group => (
                    <div key={group.label} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                      {/* Group header */}
                      <button
                        onClick={() => selectAllInGroup(group.items)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <span className={`text-${group.badge}-600`}>{group.icon}</span>
                        <span className="text-xs font-medium text-slate-700">{group.label}</span>
                        <span className="text-xs text-slate-400">({group.items.length})</span>
                        <span className="ml-auto text-xs text-slate-400">
                          {group.items.filter(i => selectedRelated.has(i.url)).length > 0
                            ? `обрано ${group.items.filter(i => selectedRelated.has(i.url)).length}`
                            : 'обрати всі'}
                        </span>
                      </button>
                      {/* Items */}
                      <div className="divide-y divide-slate-50">
                        {group.items.map(r => (
                          <label
                            key={r.url}
                            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedRelated.has(r.url)}
                              onChange={() => toggleRelated(r.url)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="flex-1 text-slate-700 line-clamp-2 text-xs leading-relaxed">
                              {r.docNumber && <span className="font-mono text-slate-500 mr-1">{r.docNumber}</span>}
                              {r.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Import button */}
          <div className="flex gap-2">
            {canImport && (
              <button
                onClick={handleImport}
                disabled={importing || loadingRelated}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Імпортувати ({1 + selectedRelated.size})
              </button>
            )}
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Скасувати
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
