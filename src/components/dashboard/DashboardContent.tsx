"use client";
import React from 'react';
import { usePathname } from 'next/navigation';
import { UserInfo } from '@/types/azure';
import {
  ActivityContent,
  ReportsContent,
  DepartmentContent,
  EmployeesContent,
  CompaniesContent,
  ReferencesContent
} from './content';
import KPIContent from './content/KPIContent';
import PlansPageNew from '@/components/plans/PlansPageNew';
import logger from '@/lib/logger';

interface DashboardContentProps {
  user: UserInfo;
  currentPath?: string;
  fetchPlanCounts?: () => void;
}

export default function DashboardContent({ user, currentPath, fetchPlanCounts }: DashboardContentProps) {
  // Удалён debug-лог: logger.log('[DASHBOARD] DashboardContent получил user:', user);
  const pathname = usePathname();
  const activePath = currentPath || pathname || '';

  const renderContent = () => {
    if (activePath === '/dashboard') {
      return <ActivityContent user={user} />;
    }

    const currentSection = activePath.split('/').pop();

    switch (currentSection) {
      case 'statistics':
        return <ActivityContent user={user} />;
      case 'plans':
        return <PlansPageNew user={user} fetchPlanCounts={fetchPlanCounts} />;
      case 'reports':
        return <ReportsContent user={user} />;
      case 'department':
        return <DepartmentContent user={user} />;
      case 'employees':
        return <EmployeesContent user={user} />;
      case 'companies':
        return <CompaniesContent user={user} />;
      case 'kpi':
        return <KPIContent />;
      case 'references':
        return <ReferencesContent user={user} />;
      default:
        return <ActivityContent user={user} />;
    }
  };

  const currentSection = activePath.split('/').pop();
  const isFullHeightPage = activePath === '/dashboard' || currentSection === 'plans' || currentSection === 'references';

  return (
    <div className={isFullHeightPage ? "h-full" : "px-6 pb-6"}>
      {renderContent()}
    </div>
  );
}

