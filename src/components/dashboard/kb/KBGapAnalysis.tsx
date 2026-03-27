'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookPlus, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import type { GapTopic } from '@/app/api/kb/gap-analysis/route';

export default function KBGapAnalysis() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['kb-gap-analysis'],
    queryFn: async () => {
      const res = await fetch('/api/kb/gap-analysis', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load gap analysis');
      return res.json() as Promise<{ topics: GapTopic[]; cached: boolean; builtAt: number }>;
    },
    staleTime: 60 * 60 * 1000,
  });

  const topics = data?.topics ?? [];
  const builtAt = data?.builtAt ? new Date(data.builtAt).toLocaleDateString('uk-UA') : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-800">Прогалини в базі знань</h3>
          <p className="text-xs text-slate-500 mt-0.5">Теми, які шукали, але КБ не покрила</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          aria-label="Оновити аналіз прогалин"
          disabled={isFetching}
          className="gap-1.5"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} aria-hidden="true" />
          <span className="hidden xs:inline text-xs">Оновити</span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" aria-hidden="true" />
          <span className="ml-2 text-sm text-slate-500">Аналіз запитів через AI...</span>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 text-sm">Помилка завантаження</div>
      ) : topics.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-10 w-10 text-emerald-400" aria-hidden="true" />}
          title="Прогалин не виявлено"
          description="Всі запити мають відповіді в КБ"
          className="py-16"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topics.map((topic, i) => (
            <GapCard key={i} topic={topic} />
          ))}
        </div>
      )}

      {builtAt && (
        <p className="text-[10px] text-slate-400 text-center">
          {data?.cached ? 'Кеш' : 'Побудовано'} · {builtAt}
        </p>
      )}
    </div>
  );
}

function GapCard({ topic }: { topic: GapTopic }) {
  const [expanded, setExpanded] = useState(false);

  const severityColor =
    topic.count >= 5 ? 'border-red-200 bg-red-50/50' :
    topic.count >= 3 ? 'border-amber-200 bg-amber-50/50' :
    'border-slate-200 bg-slate-50/30';

  const badgeColor =
    topic.count >= 5 ? 'bg-red-100 text-red-700' :
    topic.count >= 3 ? 'bg-amber-100 text-amber-700' :
    'bg-slate-100 text-slate-500';

  const visible = expanded ? topic.queries : topic.queries.slice(0, 2);

  return (
    <div className={cn('rounded-xl border p-3 sm:p-4 transition-shadow duration-150 hover:shadow-sm', severityColor)}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold text-slate-800 leading-tight">{topic.topic}</h4>
        <span className={cn('flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full', badgeColor)}>
          {topic.count}
        </span>
      </div>

      {topic.suggestion && (
        <div className="flex items-center gap-1.5 mb-2.5 text-xs text-indigo-700">
          <BookPlus className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="italic leading-tight">{topic.suggestion}</span>
        </div>
      )}

      <div className="space-y-1">
        {visible.map((q, i) => (
          <p
            key={i}
            className="text-[11px] text-slate-500 bg-white/80 rounded px-2 py-1 border border-slate-100 leading-tight"
          >
            {q}
          </p>
        ))}
        {topic.queries.length > 2 && (
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Згорнути запити' : `Показати ще ${topic.queries.length - 2}`}
            className="text-[10px] text-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 mt-0.5"
          >
            {expanded ? '▲ Згорнути' : `▼ +${topic.queries.length - 2} запит(и)`}
          </button>
        )}
      </div>

      {topic.count >= 3 && (
        <div className="mt-2.5 pt-2 border-t border-current/10">
          <span className="text-[10px] font-medium flex items-center gap-1 text-amber-600">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Рекомендовано додати документ
          </span>
        </div>
      )}
    </div>
  );
}
