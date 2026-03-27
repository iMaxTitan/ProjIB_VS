'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Shield,
  Loader2,
  MessageSquare,
  Trash2,
  FileQuestion,
  BookX,
  HelpCircle,
} from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import { Button } from '@/components/ui/Button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import EmptyState from '@/components/ui/EmptyState';
import DashboardTopTabs, { type DashboardTopTabItem } from '@/components/dashboard/shared/DashboardTopTabs';
import KBGapAnalysis from './KBGapAnalysis';
import KBClusterMap from './KBClusterMap';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
}

interface QueryLog {
  id: string;
  created_at: string;
  user_id: string;
  user_role: string;
  source: string;
  query_original: string;
  query_translated: string | null;
  category_hint: string | null;
  category_detected: string | null;
  top_score: number | null;
  chunks_found: number;
  search_attempt: string | null;
  ai_refused: boolean;
  synthesis_cost: number;
  rerank_top_score: number | null;
  answer_text: string | null;
  triage_label: string | null;
  triage_note: string | null;
  triaged_at: string | null;
  anonymous_name: string | null;
  user_profiles: { full_name: string } | null;
}

type DateRange = 'today' | 'week' | 'month' | 'all';
type StatusFilter = 'all' | 'failed' | 'untriaged';
type TriageLabel = 'bad_docs' | 'bad_query' | 'garbage' | 'out_of_scope' | 'ok';
type AnalyticsTab = 'queries' | 'gaps' | 'clusters';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIAGE_OPTIONS: Array<{ value: TriageLabel; label: string; icon: React.ReactNode; cls: string }> = [
  { value: 'bad_docs', label: 'Немає в КБ', icon: <BookX className="h-3.5 w-3.5" aria-hidden="true" />, cls: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { value: 'bad_query', label: 'Поганий запит', icon: <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />, cls: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { value: 'garbage', label: 'Сміття', icon: <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />, cls: 'bg-slate-100 text-slate-600 hover:bg-slate-200' },
  { value: 'out_of_scope', label: 'Не наша тема', icon: <FileQuestion className="h-3.5 w-3.5" aria-hidden="true" />, cls: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { value: 'ok', label: 'Все ок', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />, cls: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
];

const TRIAGE_BADGE: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  bad_docs:     { label: 'Немає в КБ',     variant: 'red' },
  bad_query:    { label: 'Поганий запит',   variant: 'amber' },
  garbage:      { label: 'Сміття',          variant: 'slate' },
  out_of_scope: { label: 'Не наша тема',    variant: 'blue' },
  ok:           { label: 'Ок',              variant: 'emerald' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDateRange(range: DateRange): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  const now = new Date();
  const to = now.toISOString();
  if (range === 'today') {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return { from, to };
  }
  if (range === 'week') {
    const from = new Date(now.getTime() - 7 * 86400000).toISOString();
    return { from, to };
  }
  // month
  const from = new Date(now.getTime() - 30 * 86400000).toISOString();
  return { from, to };
}

function getStatusColor(log: QueryLog): string {
  if (log.chunks_found === 0) return 'text-red-600';
  if (log.ai_refused) return 'text-amber-600';
  if (log.top_score !== null && log.top_score < 0.25) return 'text-amber-500';
  return 'text-emerald-600';
}

function getStatusIcon(log: QueryLog) {
  if (log.chunks_found === 0) return <XCircle className="h-4 w-4 text-red-500" aria-hidden="true" />;
  if (log.ai_refused) return <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function KBAnalyticsContent({ user, tabsSlot }: Props) {
  const qc = useQueryClient();
  const isChief = user.role === 'chief';

  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>('queries');
  const [dateRange, setDateRange] = useState<DateRange>('week');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const dates = useMemo(() => getDateRange(dateRange), [dateRange]);

  // ─── Query ────────────────────────────────────────────────────────────────

  const { data: response, isLoading, error } = useQuery({
    queryKey: ['kb-query-log', dateRange, statusFilter, sourceFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (dates.from) params.set('dateFrom', dates.from);
      if (dates.to) params.set('dateTo', dates.to);

      const res = await fetch(`/api/kb/query-log?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json() as Promise<{ logs: QueryLog[]; total: number }>;
    },
    staleTime: 30_000,
    enabled: isChief,
  });

  const logs = response?.logs ?? [];
  const total = response?.total ?? 0;

  // ─── Triage mutation ──────────────────────────────────────────────────────

  const triageMutation = useMutation({
    mutationFn: async ({ id, label }: { id: string; label: TriageLabel }) => {
      const res = await fetch('/api/kb/query-log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, triageLabel: label }),
      });
      if (!res.ok) throw new Error('Failed to update');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-query-log'] });
    },
  });

  const handleTriage = useCallback((id: string, label: TriageLabel) => {
    triageMutation.mutate({ id, label });
  }, [triageMutation]);

  // ─── Stats ────────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!logs.length) return { total: 0, failed: 0, failRate: 0, avgScore: 0, totalCost: 0 };
    const failed = logs.filter(l => l.chunks_found === 0 || l.ai_refused).length;
    const withScore = logs.filter(l => l.top_score !== null);
    const avgScore = withScore.length > 0
      ? withScore.reduce((s, l) => s + (l.top_score ?? 0), 0) / withScore.length
      : 0;
    const totalCost = logs.reduce((s, l) => s + (l.synthesis_cost || 0), 0);
    return {
      total: logs.length,
      failed,
      failRate: logs.length > 0 ? (failed / logs.length) * 100 : 0,
      avgScore,
      totalCost,
    };
  }, [logs]);

  // ─── Access guard ─────────────────────────────────────────────────────────

  if (!isChief) {
    return (
      <div className="flex flex-col h-full">
        {tabsSlot}
        <EmptyState
          icon={<Shield className="h-12 w-12" aria-hidden="true" />}
          title="Доступно лише для керівника"
          variant="centered"
        />
      </div>
    );
  }

  const ANALYTICS_TABS: DashboardTopTabItem<AnalyticsTab>[] = [
    { id: 'queries',  label: 'Запити', icon: Search, tone: 'indigo' },
    { id: 'gaps',     label: 'Прогалини', icon: AlertTriangle, tone: 'indigo' },
    { id: 'clusters', label: 'Карта знань', icon: BarChart3, tone: 'indigo' },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {tabsSlot}

      {/* ─── Analytics sub-tabs ─────────────────────────────────── */}
      <DashboardTopTabs
        selected={analyticsTab}
        items={ANALYTICS_TABS}
        onSelect={setAnalyticsTab}
        ariaLabel="Розділ аналітики КБ"
      />

      <div className="flex-1 overflow-y-auto px-3 sm:px-4 md:px-6 pb-6 space-y-4 sm:space-y-5">
        {analyticsTab === 'gaps' && <div className="pt-4"><KBGapAnalysis /></div>}
        {analyticsTab === 'clusters' && <div className="pt-4"><KBClusterMap /></div>}
        {analyticsTab === 'queries' && <>
        {/* ─── Stats cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3 sm:mt-4">
          <StatCard
            label="Запитів"
            value={stats.total}
            sub={`всього (${total})`}
            icon={<Search className="h-4 w-4" aria-hidden="true" />}
            tone="indigo"
          />
          <StatCard
            label="Без відповіді"
            value={`${stats.failRate.toFixed(0)}%`}
            sub={`${stats.failed} з ${stats.total}`}
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            tone={stats.failRate > 30 ? 'red' : stats.failRate > 15 ? 'amber' : 'emerald'}
          />
          <StatCard
            label="Сер. score"
            value={stats.avgScore.toFixed(2)}
            sub="cosine similarity"
            icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
            tone={stats.avgScore < 0.3 ? 'red' : stats.avgScore < 0.5 ? 'amber' : 'emerald'}
          />
          <StatCard
            label="Витрати"
            value={`$${stats.totalCost.toFixed(3)}`}
            sub="синтез (haiku)"
            icon={<MessageSquare className="h-4 w-4" aria-hidden="true" />}
            tone="gray"
          />
        </div>

        {/* ─── Filters ──────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 items-center">
          <FilterGroup
            label="Період"
            options={[
              { value: 'today', label: 'Сьогодні' },
              { value: 'week', label: 'Тиждень' },
              { value: 'month', label: 'Місяць' },
              { value: 'all', label: 'Все' },
            ]}
            selected={dateRange}
            onChange={(v) => setDateRange(v as DateRange)}
          />
          <FilterGroup
            label="Статус"
            options={[
              { value: 'all', label: 'Всі' },
              { value: 'failed', label: 'Провали' },
              { value: 'untriaged', label: 'Без мітки' },
            ]}
            selected={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
          />
          <FilterGroup
            label="Джерело"
            options={[
              { value: 'all', label: 'Всі' },
              { value: 'web', label: 'Web' },
              { value: 'telegram', label: 'TG' },
              { value: 'teams', label: 'Teams' },
              { value: 'voice-bot', label: 'Voice' },
            ]}
            selected={sourceFilter}
            onChange={setSourceFilter}
          />
        </div>

        {/* ─── Table ──────────────────────────────────────────── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-red-500 text-sm">Помилка завантаження даних</div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<Search className="h-8 w-8" aria-hidden="true" />}
            title="Немає запитів за обраний період"
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 w-8" aria-label="Статус" />
                  <th className="px-3 py-2.5">Дата</th>
                  <th className="px-3 py-2.5 hidden sm:table-cell">Юзер</th>
                  <th className="px-3 py-2.5">Запит</th>
                  <th className="px-3 py-2.5 hidden md:table-cell text-center">Score</th>
                  <th className="px-3 py-2.5 hidden lg:table-cell text-center">Чанків</th>
                  <th className="px-3 py-2.5 text-center">Мітка</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <React.Fragment key={log.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-label={`Деталі запиту: ${log.query_original.slice(0, 40)}`}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId(expandedId === log.id ? null : log.id);
                        }
                      }}
                      className={cn(
                        'border-b border-slate-100 cursor-pointer transition-colors duration-150',
                        'hover:bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500',
                        idx % 2 === 1 && 'bg-slate-50/50',
                        expandedId === log.id && 'bg-indigo-50/60',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          {expandedId === log.id
                            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                            : <ChevronRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />}
                          {getStatusIcon(log)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs text-slate-500">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell text-xs max-w-[120px] truncate" title={log.anonymous_name || log.user_profiles?.full_name || undefined}>
                        {log.user_profiles?.full_name
                          ? <span className="text-slate-600">{log.user_profiles.full_name}</span>
                          : log.anonymous_name
                            ? <span className="text-violet-600">{log.anonymous_name}</span>
                            : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 max-w-[200px] sm:max-w-[300px] truncate">
                        <span className={cn('text-sm', getStatusColor(log))}>
                          {log.query_original}
                        </span>
                        {log.source === 'web' && (
                          <Badge variant="violet" size="sm" className="ml-1.5" aria-label="Web">W</Badge>
                        )}
                        {log.source === 'telegram' && (
                          <Badge variant="sky" size="sm" className="ml-1.5" aria-label="Telegram">TG</Badge>
                        )}
                        {log.source === 'teams' && (
                          <Badge variant="blue" size="sm" className="ml-1.5" aria-label="Teams">T</Badge>
                        )}
                        {log.source === 'voice-bot' && (
                          <Badge variant="purple" size="sm" className="ml-1.5" aria-label="Voice Bot">🎤</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-center font-mono text-xs">
                        {log.top_score !== null ? log.top_score.toFixed(2) : '—'}
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell text-center text-xs">
                        {log.chunks_found}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {log.triage_label ? (
                          <Badge variant={TRIAGE_BADGE[log.triage_label]?.variant} size="sm">
                            {TRIAGE_BADGE[log.triage_label]?.label}
                          </Badge>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>

                    {/* Expanded details */}
                    {expandedId === log.id && (
                      <tr className="bg-indigo-50/30">
                        <td colSpan={7} className="px-4 sm:px-6 py-3">
                          {/* Answer preview */}
                          {log.answer_text && (
                            <div className="mb-3 p-2.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                              {log.answer_text}
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs mb-3">
                            {log.query_translated && (
                              <DetailRow label="Переклад (укр)" value={log.query_translated} />
                            )}
                            <DetailRow label="Score (cosine)" value={log.top_score != null ? log.top_score.toFixed(4) : '—'} />
                            <DetailRow label="Rerank score (Voyage)" value={log.rerank_top_score != null ? log.rerank_top_score.toFixed(4) : '—'} />
                            <DetailRow label="Категорія (знайдено)" value={log.category_detected ?? '—'} />
                            <DetailRow label="Search attempt" value={log.search_attempt ?? '—'} />
                            <DetailRow label="AI відмовився" value={log.ai_refused ? 'Так' : 'Ні'} />
                            <DetailRow label="Вартість" value={`$${(log.synthesis_cost || 0).toFixed(5)}`} />
                            <DetailRow label="Роль" value={log.user_role} />
                            <DetailRow label="Джерело" value={log.source} />
                          </div>

                          {/* Triage buttons */}
                          <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs text-slate-500 self-center mr-1">Мітка:</span>
                            {TRIAGE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                onClick={(e) => { e.stopPropagation(); handleTriage(log.id, opt.value); }}
                                aria-label={`Позначити як: ${opt.label}`}
                                disabled={triageMutation.isPending}
                                className={cn(
                                  'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium',
                                  'transition-colors duration-150 focus-ring',
                                  'disabled:opacity-50 disabled:cursor-not-allowed',
                                  log.triage_label === opt.value
                                    ? `${opt.cls} ring-2 ring-offset-1 ring-current`
                                    : `${opt.cls} opacity-70`,
                                )}
                              >
                                {opt.icon}
                                <span className="hidden xs:inline">{opt.label}</span>
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            {total > logs.length && (
              <div className="px-4 py-2.5 text-xs text-slate-400 text-center border-t border-slate-100">
                Показано {logs.length} з {total}
              </div>
            )}
          </div>
        )}
        </>}
      </div>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, tone }: {
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; tone: string;
}) {
  const bgMap: Record<string, string> = {
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    gray: 'bg-slate-50 text-slate-600',
  };
  return (
    <div className={cn('rounded-lg p-3 sm:p-4', bgMap[tone] || bgMap.gray)}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-75">{label}</span>
      </div>
      <div className="text-lg sm:text-xl font-bold">{value}</div>
      <div className="text-[10px] sm:text-xs opacity-60">{sub}</div>
    </div>
  );
}

function FilterGroup({ label, options, selected, onChange }: {
  label: string;
  options: Array<{ value: string; label: string }>;
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-slate-400 mr-0.5">{label}:</span>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-label={`${label}: ${opt.label}`}
          aria-pressed={selected === opt.value}
          className={cn(
            'px-2 py-1 rounded-md text-xs font-medium transition-colors duration-150',
            'focus-ring',
            selected === opt.value
              ? 'bg-indigo-100 text-indigo-700'
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}:</span>{' '}
      <span className="text-slate-700 break-all">{value}</span>
    </div>
  );
}
