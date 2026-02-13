'use client';

import React from 'react';
import { kpi as kpiDesign } from '@/styles/design-system';
import type { KPIStatus } from './types';

interface KPIStatusBadgeProps {
  actual: number;
  planned: number;
}

export default function KPIStatusBadge({ actual, planned }: KPIStatusBadgeProps) {
  const status: KPIStatus = kpiDesign.getKPIStatus(actual, planned);
  const label = kpiDesign.getStatusLabel(status);
  const tw = kpiDesign.getTailwindBg(status);

  return (
    <span
      className={`inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${tw}`}
      aria-label={`Статус KPI: ${label}`}
    >
      {label}
    </span>
  );
}
