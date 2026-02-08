'use client';

import React from 'react';

interface ReferenceDetailsEmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

export default function ReferenceDetailsEmptyState({
  icon,
  title,
  description,
}: ReferenceDetailsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
      <div className="mb-4 opacity-30">{icon}</div>
      <p className="text-lg font-medium mb-2">{title}</p>
      <p className="text-sm text-center">{description}</p>
    </div>
  );
}

