'use client';

import React, { useState } from 'react';
import { UserInfo } from '@/types/azure';
import { cn } from '@/lib/utils';
import { ReferencesTabs, type ReferenceType } from './references/ReferencesTabs';
import CompaniesReferenceContent from './references/CompaniesReferenceContent';
import EmployeesReferenceContent from './references/EmployeesReferenceContent';
import MeasuresReferenceContent from './references/MeasuresReferenceContent';
import ProjectsReferenceContent from './references/ProjectsReferenceContent';

interface ReferencesContentProps {
  user: UserInfo;
}

export default function ReferencesContent({ user }: ReferencesContentProps) {
  const [selectedRef, setSelectedRef] = useState<ReferenceType>('employees');
  const tabs = <ReferencesTabs selectedRef={selectedRef} onSelect={setSelectedRef} />;

  const getContentBg = () => {
    if (selectedRef === 'measures') return 'bg-purple-50/30';
    if (selectedRef === 'companies') return 'bg-blue-50/30';
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
      case 'measures':
        return <MeasuresReferenceContent user={user} tabsSlot={tabs} />;
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
