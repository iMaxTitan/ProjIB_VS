'use client';

import React from 'react';
import { UserCircle, ExternalLink } from 'lucide-react';
import { UserInfo } from '@/types/azure';
import { useCabinetStats } from '@/hooks/useCabinetStats';
import { Spinner } from '@/components/ui/Spinner';
import CabinetSummaryCards from './CabinetSummaryCards';
import CabinetProfile from './CabinetProfile';
import CabinetBotSettings from './CabinetBotSettings';
import CabinetVacationCalendar from './CabinetVacationCalendar';


interface CabinetContentProps {
  user: UserInfo;
}

export default function CabinetContent({ user: _user }: CabinetContentProps) {
  const { data: stats, isLoading, error } = useCabinetStats();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner className="h-8 w-8 text-indigo-500" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <UserCircle className="h-10 w-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Не вдалося завантажити дані кабінету</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-5">
          {/* Summary cards */}
          <CabinetSummaryCards stats={stats} />

          {/* Vacation calendar — all roles, approvals inline */}
          <CabinetVacationCalendar />

          {/* Chief-only: dev links */}
          {(['chief', 'head', 'analyst', 'employee'].includes(stats.profile.role)) && (
            <div className="flex flex-wrap gap-3">
              <a
                href="/demo-plans-redesign.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Дизайн планів (демо)
              </a>
              <a
                href="/voice-chat"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Голосовий бот
              </a>
              <a
                href="/demo-design3.html"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                Дизайн планів v3
              </a>
            </div>
          )}

          {/* Profile + bot settings */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <CabinetProfile profile={stats.profile} />
            <CabinetBotSettings />
          </div>
        </div>
      </div>
    </div>
  );
}
