'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type StatTone = 'blue' | 'emerald' | 'purple' | 'amber' | 'slate';

const toneText: Record<StatTone, string> = {
  blue: 'text-blue-600',
  emerald: 'text-emerald-600',
  purple: 'text-purple-600',
  amber: 'text-amber-600',
  slate: 'text-slate-700',
};

interface DashboardStatCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  tone?: StatTone;
}

export default function DashboardStatCard({
  title,
  value,
  icon: Icon,
  tone = 'slate',
}: DashboardStatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <Icon className={cn('w-5 h-5', toneText[tone])} />
      </div>
      <div className={cn('mt-1 text-2xl font-bold', toneText[tone])}>{value}</div>
    </div>
  );
}

