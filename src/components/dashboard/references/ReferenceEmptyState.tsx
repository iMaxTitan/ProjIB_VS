'use client';

import React from 'react';
import EmptyState from '@/components/ui/EmptyState';

interface ReferenceEmptyStateProps {
  icon: React.ReactNode;
  text: string;
}

export default function ReferenceEmptyState({ icon, text }: ReferenceEmptyStateProps) {
  return <EmptyState icon={icon} title={text} variant="inline" />;
}
