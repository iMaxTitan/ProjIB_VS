'use client';

import React from 'react';
import { kpi as kpiDesign } from '@/styles/design-system';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import type { KPIStatus } from './types';

const KPI_VARIANT: Record<string, BadgeProps['variant']> = {
  exceeds: 'amber',
  good: 'emerald',
  warning: 'orange',
  critical: 'red',
};

interface KPIStatusBadgeProps {
  actual: number;
  planned: number;
}

export default function KPIStatusBadge({ actual, planned }: KPIStatusBadgeProps) {
  const status: KPIStatus = kpiDesign.getKPIStatus(actual, planned);
  const label = kpiDesign.getStatusLabel(status);

  return (
    <Badge
      variant={KPI_VARIANT[status] ?? 'slate'}
      size="sm"
      className="sm:px-2 sm:text-xs"
      aria-label={`Статус KPI: ${label}`}
    >
      {label}
    </Badge>
  );
}
