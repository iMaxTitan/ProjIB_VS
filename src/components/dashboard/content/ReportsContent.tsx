'use client';

import React, { useState } from 'react';
import { Building2, Users, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DashboardTopTabs,
  type DashboardTopTabItem,
} from './shared';

import CompaniesReportTab from './reports/CompaniesReportTab';
import EmployeesReportTab from './reports/EmployeesReportTab';
import MonthReportTab from './reports/MonthReportTab';
import QuarterlyReportTab from './reports/QuarterlyReportTab';

type ReportTabType = 'companies' | 'employees' | 'month' | 'quarterly';

const tabItems: DashboardTopTabItem<ReportTabType>[] = [
  { id: 'companies', label: 'Предприятия', shortLabel: 'Предпр.', icon: Building2, tone: 'blue' },
  { id: 'employees', label: 'Сотрудники', shortLabel: 'Сотр.', icon: Users, tone: 'emerald' },
  { id: 'month', label: 'Месяцы', shortLabel: 'Месяцы', icon: CalendarDays, tone: 'purple' },
  { id: 'quarterly', label: 'Кварталы', shortLabel: 'Кварт.', icon: CalendarDays, tone: 'purple' },
];

export default function ReportsContent() {
  const [activeTab, setActiveTab] = useState<ReportTabType>('month');

  const tabs = (
    <DashboardTopTabs
      selected={activeTab}
      items={tabItems}
      onSelect={setActiveTab}
      ariaLabel="Фильтр типов отчетов"
    />
  );

  const getContentBg = () => {
    if (activeTab === 'companies') return 'bg-blue-50/30';
    if (activeTab === 'employees') return 'bg-emerald-50/30';
    return 'bg-purple-50/30';
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'companies':
        return <CompaniesReportTab tabsSlot={tabs} />;
      case 'employees':
        return <EmployeesReportTab tabsSlot={tabs} />;
      case 'month':
        return <MonthReportTab tabsSlot={tabs} />;
      case 'quarterly':
        return <QuarterlyReportTab tabsSlot={tabs} />;
      default:
        return null;
    }
  };

  return (
    <div className={cn('h-full overflow-hidden', getContentBg())}>
      {renderContent()}
    </div>
  );
}
