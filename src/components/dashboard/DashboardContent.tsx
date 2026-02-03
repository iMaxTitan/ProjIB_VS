"use client";
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserInfo } from '@/types/azure';
import {
  ActivityContent,
  ReportsContent,
  DepartmentContent,
  EmployeesContent,
  CompaniesContent,
  DefaultContent
} from './content';
import TasksPageNew from '@/app/dashboard/tasks/page-new';
import KPIContent from './content/KPIContent';
import PlansPageNew from '@/components/plans/PlansPageNew';

interface DashboardContentProps {
  user: UserInfo;
  currentPath?: string;
  fetchPlanCounts?: () => void;
}

export default function DashboardContent({ user, currentPath, fetchPlanCounts }: DashboardContentProps) {
  // Удалён debug-лог: console.log('[DASHBOARD] DashboardContent получил user:', user);
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
      case 'tasks':
        return <TasksPageNew />;
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
      default:
        return <DefaultContent user={user} />;
    }
  };

  const currentSection = activePath.split('/').pop();
  const isFullHeightPage = currentSection === 'plans' || currentSection === 'tasks';

  return (
    <div className={isFullHeightPage ? "h-full" : "px-6 pb-6"}>
      {renderContent()}
    </div>
  );
}
