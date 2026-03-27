'use client';

import React from 'react';
import EmptyState from '@/components/ui/EmptyState';

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
  return <EmptyState icon={icon} title={title} description={description} variant="centered" />;
}
