'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, RefreshCw, Map } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import EmptyState from '@/components/ui/EmptyState';
import type { DocCluster } from '@/app/api/kb/clusters/route';

const CATEGORY_BADGE: Record<string, string> = {
  ib:    'bg-indigo-100 text-indigo-700',
  hr:    'bg-emerald-100 text-emerald-700',
  it:    'bg-blue-100 text-blue-700',
  legal: 'bg-amber-100 text-amber-700',
};

const CLUSTER_COLORS = [
  'border-indigo-200 bg-indigo-50/40',
  'border-emerald-200 bg-emerald-50/40',
  'border-blue-200 bg-blue-50/40',
  'border-amber-200 bg-amber-50/40',
  'border-rose-200 bg-rose-50/40',
  'border-violet-200 bg-violet-50/40',
  'border-teal-200 bg-teal-50/40',
  'border-orange-200 bg-orange-50/40',
];

export default function KBClusterMap() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['kb-clusters'],
    queryFn: async () => {
      const res = await fetch('/api/kb/clusters', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load clusters');
      return res.json() as Promise<{ clusters: DocCluster[]; cached: boolean; builtAt: number }>;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const clusters = data?.clusters ?? [];
  const builtAt = data?.builtAt ? new Date(data.builtAt).toLocaleDateString('uk-UA') : null;
  const totalDocs = clusters.reduce((s, c) => s + c.docs.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-slate-800">Карта знань</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Тематична кластеризація {totalDocs > 0 ? `· ${totalDocs} документів` : ''}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          aria-label="Перебудувати карту знань"
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
          <span className="ml-2 text-sm text-slate-500">Кластеризація документів...</span>
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 text-sm">Помилка завантаження</div>
      ) : clusters.length === 0 ? (
        <EmptyState
          icon={<Map className="h-10 w-10" aria-hidden="true" />}
          title="Немає документів для кластеризації"
          description="Додайте документи до бази знань"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clusters.map((cluster, i) => (
            <ClusterCard
              key={i}
              cluster={cluster}
              colorClass={CLUSTER_COLORS[i % CLUSTER_COLORS.length]}
            />
          ))}
        </div>
      )}

      {builtAt && (
        <p className="text-[10px] text-slate-400 text-center">
          {data?.cached ? 'Кеш 24 год' : 'Побудовано'} · {builtAt}
        </p>
      )}
    </div>
  );
}

function ClusterCard({ cluster, colorClass }: { cluster: DocCluster; colorClass: string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? cluster.docs : cluster.docs.slice(0, 4);

  return (
    <div className={cn('rounded-xl border p-3 sm:p-4', colorClass)}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-800 leading-tight">{cluster.label}</h4>
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/70 text-slate-600">
          {cluster.docs.length}
        </span>
      </div>

      <div className="space-y-1.5">
        {visible.map((doc) => (
          <div
            key={doc.id}
            className="flex items-center gap-1.5 text-xs text-slate-700 bg-white/60 rounded-md px-2 py-1.5 border border-white/80"
          >
            <span
              className={cn(
                'flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded uppercase tracking-wide',
                CATEGORY_BADGE[doc.category] ?? 'bg-slate-100 text-slate-600'
              )}
            >
              {doc.category}
            </span>
            <span className="truncate leading-tight">{doc.title}</span>
          </div>
        ))}

        {cluster.docs.length > 4 && (
          <button
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? 'Згорнути список' : `Показати ще ${cluster.docs.length - 4}`}
            className="text-[10px] text-slate-500 hover:text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-1 mt-0.5"
          >
            {expanded ? '▲ Згорнути' : `▼ +${cluster.docs.length - 4} документ(и)`}
          </button>
        )}
      </div>
    </div>
  );
}
