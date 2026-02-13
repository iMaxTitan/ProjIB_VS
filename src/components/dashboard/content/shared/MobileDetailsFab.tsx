import React from 'react';
import { cn } from '@/lib/utils';

type FabTone = 'blue' | 'emerald' | 'purple';

const GRADIENT_MAP: Record<FabTone, string> = {
  blue: 'from-blue-600 to-indigo-600 shadow-indigo-500/30',
  emerald: 'from-emerald-600 to-teal-600 shadow-emerald-500/30',
  purple: 'from-purple-600 to-indigo-600 shadow-indigo-500/30',
};

interface MobileDetailsFabProps {
  onClick: () => void;
  tone?: FabTone;
  label?: string;
  ariaLabel?: string;
  children?: React.ReactNode;
}

export default function MobileDetailsFab({
  onClick,
  tone = 'purple',
  label = 'Детали',
  ariaLabel = 'Открыть панель деталей',
  children,
}: MobileDetailsFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'fixed bottom-6 right-6 z-50 bg-gradient-to-r text-white rounded-full shadow-lg transition-transform active:scale-95',
        children ? 'p-4' : 'px-3.5 py-2.5 text-sm font-semibold',
        GRADIENT_MAP[tone],
      )}
    >
      {children ?? label}
    </button>
  );
}
