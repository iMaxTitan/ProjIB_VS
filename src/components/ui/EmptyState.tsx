'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  variant?: 'inline' | 'centered';
  children?: React.ReactNode;
  className?: string;
}

export default function EmptyState({
  icon,
  title,
  description,
  variant = 'inline',
  children,
  className,
}: EmptyStateProps) {
  if (variant === 'centered') {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full text-slate-400 p-8', className)}>
        {icon && <div className="mb-4 opacity-30">{icon}</div>}
        {title && <p className="text-lg font-medium mb-2">{title}</p>}
        {description && <p className="text-sm text-center">{description}</p>}
        {children}
      </div>
    );
  }

  return (
    <div className={cn('text-center py-12 text-slate-400', className)}>
      {icon && <div className="flex justify-center mb-3 opacity-50">{icon}</div>}
      {title && <p className="text-sm">{title}</p>}
      {description && <p className="text-xs mt-1">{description}</p>}
      {children}
    </div>
  );
}
