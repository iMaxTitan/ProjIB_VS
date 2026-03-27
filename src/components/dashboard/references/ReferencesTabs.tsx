'use client';

import { Banknote, Building2, CalendarDays, FileSpreadsheet, Folder, Users, Video } from 'lucide-react';
import DashboardTopTabs, { DashboardTopTabItem } from '../shared/DashboardTopTabs';

export type ReferenceType = 'projects' | 'procedures' | 'companies' | 'employees' | 'calendar' | 'meetings' | 'budget_items';

const REFERENCE_TABS: DashboardTopTabItem<ReferenceType>[] = [
  { id: 'projects', label: 'Проекты', shortLabel: 'Проекты', icon: Folder, tone: 'amber' },
  { id: 'procedures', label: 'Процедуры', shortLabel: 'Процед.', icon: FileSpreadsheet, tone: 'purple' },
  { id: 'companies', label: 'Предприятия', shortLabel: 'Предпр.', icon: Building2, tone: 'blue' },
  { id: 'employees', label: 'Сотрудники', shortLabel: 'Сотр.', icon: Users, tone: 'emerald' },
  { id: 'calendar', label: 'Календарь', shortLabel: 'Календ.', icon: CalendarDays, tone: 'indigo' },
  { id: 'meetings', label: 'Наради', shortLabel: 'Наради', icon: Video, tone: 'indigo' },
  { id: 'budget_items', label: 'Бюджетні статті', shortLabel: 'Бюджет', icon: Banknote, tone: 'emerald' },
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
      iconOnly
    />
  );
}
