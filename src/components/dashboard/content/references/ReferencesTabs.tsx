'use client';

import { Building2, FileSpreadsheet, Folder, Users } from 'lucide-react';
import DashboardTopTabs, { DashboardTopTabItem } from '../shared/DashboardTopTabs';

export type ReferenceType = 'projects' | 'measures' | 'companies' | 'employees';

const REFERENCE_TABS: DashboardTopTabItem<ReferenceType>[] = [
  { id: 'projects', label: 'Проекты', shortLabel: 'Проекты', icon: Folder, tone: 'amber' },
  { id: 'measures', label: 'Мероприятия', shortLabel: 'Меропр.', icon: FileSpreadsheet, tone: 'purple' },
  { id: 'companies', label: 'Предприятия', shortLabel: 'Предпр.', icon: Building2, tone: 'blue' },
  { id: 'employees', label: 'Сотрудники', shortLabel: 'Сотр.', icon: Users, tone: 'emerald' },
];

interface ReferencesTabsProps {
  selectedRef: ReferenceType;
  onSelect: (value: ReferenceType) => void;
}

export function ReferencesTabs({ selectedRef, onSelect }: ReferencesTabsProps) {
  return (
    <DashboardTopTabs
      selected={selectedRef}
      items={REFERENCE_TABS}
      onSelect={onSelect}
      ariaLabel="Навигация по справочникам"
    />
  );
}
