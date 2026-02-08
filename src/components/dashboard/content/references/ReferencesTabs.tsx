'use client';

import { Building2, FileSpreadsheet, Folder, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ReferenceType = 'projects' | 'measures' | 'companies' | 'employees';

interface ReferenceItem {
  id: ReferenceType;
  title: string;
  shortTitle: string;
  icon: React.ElementType;
}

const referenceItems: ReferenceItem[] = [
  {
    id: 'projects',
    title: 'Проекты',
    shortTitle: 'Проекты',
    icon: Folder,
  },
  {
    id: 'measures',
    title: 'Мероприятия',
    shortTitle: 'Меропр.',
    icon: FileSpreadsheet,
  },
  {
    id: 'companies',
    title: 'Предприятия',
    shortTitle: 'Предпр.',
    icon: Building2,
  },
  {
    id: 'employees',
    title: 'Сотрудники',
    shortTitle: 'Сотр.',
    icon: Users,
  },
];

function getTabStyles(type: ReferenceType, isSelected: boolean) {
  const baseStyles =
    'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors duration-base border-t border-l border-r whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-offset-2 focus:z-20';

  if (type === 'measures') {
    return cn(
      baseStyles,
      'focus:ring-purple-500',
      isSelected
        ? 'bg-purple-500 border-purple-500 text-white shadow-sm z-10 -mb-px'
        : 'bg-purple-50/70 border-purple-200/50 text-purple-600 hover:bg-purple-100/70 hover:text-purple-700'
    );
  }

  if (type === 'companies') {
    return cn(
      baseStyles,
      'focus:ring-blue-500',
      isSelected
        ? 'bg-blue-500 border-blue-500 text-white shadow-sm z-10 -mb-px'
        : 'bg-blue-50/70 border-blue-200/50 text-blue-600 hover:bg-blue-100/70 hover:text-blue-700'
    );
  }

  if (type === 'projects') {
    return cn(
      baseStyles,
      'focus:ring-amber-500',
      isSelected
        ? 'bg-amber-500 border-amber-500 text-white shadow-sm z-10 -mb-px'
        : 'bg-amber-50/70 border-amber-200/50 text-amber-600 hover:bg-amber-100/70 hover:text-amber-700'
    );
  }

  return cn(
    baseStyles,
    'focus:ring-emerald-500',
    isSelected
      ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm z-10 -mb-px'
      : 'bg-emerald-50/70 border-emerald-200/50 text-emerald-600 hover:bg-emerald-100/70 hover:text-emerald-700'
  );
}

interface ReferencesTabsProps {
  selectedRef: ReferenceType;
  onSelect: (value: ReferenceType) => void;
}

export function ReferencesTabs({ selectedRef, onSelect }: ReferencesTabsProps) {
  return (
    <nav
      className="flex-shrink-0 bg-gradient-to-b from-slate-50/50 to-transparent border-b border-slate-200"
      role="navigation"
      aria-label="Навигация по справочникам"
    >
      <div className="px-2 sm:px-4 pt-2">
        <div className="flex gap-0.5 items-end overflow-x-auto overflow-y-hidden scrollbar-hide">
          {referenceItems.map((item) => {
            const Icon = item.icon;
            const isSelected = selectedRef === item.id;

            return (
              <button
                type="button"
                key={item.id}
                onClick={() => onSelect(item.id)}
                aria-label={`Справочник: ${item.title}`}
                aria-current={isSelected ? 'page' : undefined}
                className={getTabStyles(item.id, isSelected)}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden xs:inline">{item.title}</span>
                <span className="xs:hidden">{item.shortTitle}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
