'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ReferenceLeftPanelShellProps {
  tabsSlot?: React.ReactNode;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  loadingColorClass?: string;
  emptyState: React.ReactNode;
  body: React.ReactNode;
  footer: React.ReactNode;
  bodyClassName?: string;
}

export default function ReferenceLeftPanelShell({
  tabsSlot,
  loading,
  error,
  isEmpty,
  loadingColorClass = 'border-indigo-500',
  emptyState,
  body,
  footer,
  bodyClassName,
}: ReferenceLeftPanelShellProps) {
  return (
    <div className="flex flex-col h-full">
      {tabsSlot}

      <div className={cn('flex-1 overflow-y-auto overscroll-contain p-2 sm:p-3', bodyClassName)}>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className={cn('animate-spin rounded-full h-8 w-8 border-b-2', loadingColorClass)} />
          </div>
        ) : error ? (
          <div className="text-center py-12 text-red-500">
            <p className="text-sm">{error}</p>
          </div>
        ) : isEmpty ? (
          emptyState
        ) : (
          body
        )}
      </div>

      <div className="flex-shrink-0 p-3 sm:p-4 border-t border-gray-100 bg-white/50">{footer}</div>
    </div>
  );
}

