import React from 'react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
  /** xs = 16px (inline), sm = 24px, md = 32px (default), lg = 48px (page) */
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  xs: 'w-4 h-4 border-2',
  sm: 'w-6 h-6 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-2',
} as const;

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', className }) => (
  <div className={cn('flex justify-center items-center', className)} role="status" aria-label="Загрузка">
    <div className={cn(sizeClasses[size], 'rounded-full border-indigo-500 border-t-transparent animate-spin')} />
  </div>
);
