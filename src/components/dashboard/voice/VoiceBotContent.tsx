'use client';

/**
 * Voice Bot — вкладка дашборду.
 * Показує статистику голосових сесій та логи.
 * Доступно тільки chief/head.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mic, Clock, Users, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { UserInfo } from '@/types/azure';

interface VoiceSession {
  id: string;
  user_id: string;
  conversation_id: string;
  duration_seconds: number;
  source: string;
  created_at: string;
  full_name?: string;
}

interface VoiceStats {
  total: number;
  today: number;
  avgDuration: number;
}

interface Props {
  user: UserInfo;
  tabsSlot?: React.ReactNode;
}

export default function VoiceBotContent({ user, tabsSlot }: Props) {
  const isChiefOrHead = user.role === 'chief' || user.role === 'head';

  const { data, isLoading, error } = useQuery({
    queryKey: ['voice-sessions'],
    queryFn: async () => {
      const res = await fetch('/api/voice/sessions?limit=50');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ sessions: VoiceSession[]; stats: VoiceStats }>;
    },
    staleTime: 30_000,
    enabled: isChiefOrHead,
  });

  const sessions = data?.sessions ?? [];
  const stats = data?.stats ?? { total: 0, today: 0, avgDuration: 0 };

  if (!isChiefOrHead) {
    return (
      <div className="h-full flex flex-col">
        {tabsSlot}
        <div className="flex-1 flex items-center justify-center">
          <p className="text-slate-400">Доступно тільки для керівників.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {tabsSlot}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header with link to voice chat */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <Mic className="h-5 w-5 text-indigo-600" />
                Голосовий бот
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Статистика голосових розмов з AI-ботом
              </p>
            </div>
            <a
              href="/voice-chat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              <Mic className="h-4 w-4" />
              Відкрити чат
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={<Mic className="h-5 w-5 text-indigo-600" />}
              label="Всього розмов"
              value={stats.total}
              loading={isLoading}
            />
            <StatCard
              icon={<Users className="h-5 w-5 text-emerald-600" />}
              label="Сьогодні"
              value={stats.today}
              loading={isLoading}
            />
            <StatCard
              icon={<Clock className="h-5 w-5 text-amber-600" />}
              label="Сер. тривалість"
              value={formatDuration(stats.avgDuration)}
              loading={isLoading}
            />
          </div>

          {/* Sessions table */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">
              Останні розмови
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : error ? (
              <p className="text-red-500 text-sm py-4">
                Помилка: {error instanceof Error ? error.message : 'Unknown'}
              </p>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Mic className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p>Розмов поки немає</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Дата</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Користувач</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Тривалість</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600">Джерело</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s, idx) => (
                      <tr
                        key={s.id}
                        className={cn(
                          'border-b border-slate-100 last:border-b-0',
                          idx % 2 === 1 && 'bg-slate-50/50',
                        )}
                      >
                        <td className="px-4 py-2.5 text-slate-600">
                          {formatDate(s.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800">
                          {s.full_name || s.user_id?.slice(0, 8) || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {formatDuration(s.duration_seconds)}
                        </td>
                        <td className="px-4 py-2.5">
                          <SourceBadge source={s.source} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, loading }: {
  icon: React.ReactNode; label: string; value: string | number; loading: boolean;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-slate-500">{label}</span>
      </div>
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-300 mt-1" />
      ) : (
        <p className="text-2xl font-semibold text-slate-800">{value}</p>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  const labels: Record<string, { text: string; cls: string }> = {
    web: { text: 'Веб', cls: 'bg-indigo-100 text-indigo-700' },
    telegram: { text: 'Telegram', cls: 'bg-sky-100 text-sky-700' },
    teams: { text: 'Teams', cls: 'bg-purple-100 text-purple-700' },
  };
  const info = labels[source] ?? { text: source, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', info.cls)}>
      {info.text}
    </span>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return '0с';
  if (seconds < 60) return `${seconds}с`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}хв ${sec}с` : `${min}хв`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
