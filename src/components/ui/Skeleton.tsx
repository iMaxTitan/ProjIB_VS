'use client';

import React from 'react';
import { cn } from '@/lib/shared/utils';

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
}

function Skeleton({ className, width, height }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded bg-slate-200', className)}
      style={{ width, height }}
    />
  );
}

function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-4 w-full rounded', className)} />;
}

function SkeletonCircle({ className }: { className?: string }) {
  return <Skeleton className={cn('h-10 w-10 rounded-full', className)} />;
}

function SkeletonCard({ className }: { className?: string }) {
  return <Skeleton className={cn('h-24 w-full rounded-xl', className)} />;
}

Skeleton.Text = SkeletonText;
Skeleton.Circle = SkeletonCircle;
Skeleton.Card = SkeletonCard;

export default Skeleton;
