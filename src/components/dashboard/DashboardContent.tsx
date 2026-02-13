"use client";

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserInfo } from '@/types/azure';
import {
  getDashboardSectionFromPath,
  isDashboardSectionFullHeight,
  renderDashboardSection,
} from '@/components/dashboard/sections';

interface DashboardContentProps {
  user: UserInfo;
  currentPath?: string;
  fetchPlanCounts?: () => void;
}

export default function DashboardContent({ user, currentPath, fetchPlanCounts }: DashboardContentProps) {
  const pathname = usePathname();
  const activePath = currentPath || pathname || '';
  const currentSection = getDashboardSectionFromPath(activePath);
  const isFullHeightPage = isDashboardSectionFullHeight(currentSection);

  return (
    <div className={isFullHeightPage ? 'h-full min-h-0 overflow-hidden' : 'px-6 pb-6'}>
      {renderDashboardSection(currentSection, { user, fetchPlanCounts })}
    </div>
  );
}
