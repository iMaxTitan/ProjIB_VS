'use client';

import React, { useState } from 'react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/shared/utils';
import { ReferencesTabs, type ReferenceType } from './ReferencesTabs';
import CalendarReferenceContent from './calendar/CalendarReferenceContent';
import CompaniesReferenceContent from './companies/CompaniesReferenceContent';
import EmployeesReferenceContent from './employees/EmployeesReferenceContent';
import ProceduresReferenceContent from './procedures/ProceduresReferenceContent';
import ProjectsReferenceContent from './ProjectsReferenceContent';
import InitiativesReferenceContent from './initiatives/InitiativesReferenceContent';
import BudgetItemsReferenceContent from './budget/BudgetItemsReferenceContent';

interface ReferencesContentProps {
  user: UserInfo;
}

export default function ReferencesContent({ user }: ReferencesContentProps) {
  const [selectedRef, setSelectedRef] = useState<ReferenceType>('employees');
  const tabs = <ReferencesTabs selectedRef={selectedRef} onSelect={setSelectedRef} />;

  const getContentBg = () => {
    if (selectedRef === 'procedures') return 'bg-purple-50/30';
    if (selectedRef === 'companies') return 'bg-blue-50/30';
    if (selectedRef === 'calendar') return 'bg-indigo-50/30';
    if (selectedRef === 'initiatives') return 'bg-amber-50/30';
    if (selectedRef === 'budget_items') return 'bg-emerald-50/30';
    return 'bg-emerald-50/30';
  };

  const renderContent = () => {
    switch (selectedRef) {
      case 'projects':
        return <ProjectsReferenceContent user={user} tabsSlot={tabs} />;
      case 'employees':
        return <EmployeesReferenceContent user={user} tabsSlot={tabs} />;
      case 'companies':
        return <CompaniesReferenceContent user={user} tabsSlot={tabs} />;
      case 'procedures':
        return <ProceduresReferenceContent user={user} tabsSlot={tabs} />;
      case 'calendar':
        return <CalendarReferenceContent user={user} tabsSlot={tabs} />;
      case 'initiatives':
        return <InitiativesReferenceContent user={user} tabsSlot={tabs} />;
      case 'budget_items':
        return <BudgetItemsReferenceContent user={user} tabsSlot={tabs} />;
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
