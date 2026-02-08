'use client';

import React from 'react';

interface ReferenceEmptyStateProps {
  icon: React.ReactNode;
  text: string;
}

export default function ReferenceEmptyState({ icon, text }: ReferenceEmptyStateProps) {
  return (
    <div className="text-center py-12 text-slate-400">
      <div className="flex justify-center mb-3 opacity-50">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  );
}

