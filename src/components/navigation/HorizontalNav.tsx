'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/types/supabase';
import {
  Zap,
  Calendar,
  FileText,
  BarChart3,
  BookOpen,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface HorizontalNavProps {
  role: UserRole;
  currentPath?: string;
  onNavigate?: (path: string) => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

// Пункты меню для руководителя (chief)
const chiefNavItems: NavItem[] = [
  { label: 'Активность', path: '/dashboard', icon: Zap },
  { label: 'Планы', path: '/dashboard/plans', icon: Calendar },
  { label: 'Отчеты', path: '/dashboard/reports', icon: FileText },
  { label: 'KPI', path: '/dashboard/kpi', icon: BarChart3 },
  { label: 'Справочники', path: '/dashboard/references', icon: BookOpen }
];

// Пункты меню для начальника отдела (head)
const headNavItems: NavItem[] = [
  { label: 'Активность', path: '/dashboard', icon: Zap },
  { label: 'Планы', path: '/dashboard/plans', icon: Calendar },
  { label: 'Отчеты', path: '/dashboard/reports', icon: FileText },
  { label: 'KPI', path: '/dashboard/kpi', icon: BarChart3 },
  { label: 'Справочники', path: '/dashboard/references', icon: BookOpen }
];

// Пункты меню для сотрудника (employee)
const employeeNavItems: NavItem[] = [
  { label: 'Активность', path: '/dashboard', icon: Zap },
  { label: 'Планы', path: '/dashboard/plans', icon: Calendar },
  { label: 'KPI', path: '/dashboard/kpi', icon: BarChart3 }
];

const navigationItems: Record<UserRole, Array<NavItem>> = {
  chief: chiefNavItems,
  head: headNavItems,
  employee: employeeNavItems
};

export default function HorizontalNav({ role, currentPath, onNavigate }: HorizontalNavProps) {
  const pathname = usePathname();

  // Используем currentPath, если передан, иначе pathname
  const activePath = currentPath || pathname;

  const isPathActive = (path: string) => {
    return activePath === path;
  };

  const handleNavigation = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      // URL не обновляем: всё работает внутри одного дашборда
    }
  };

  return (
    <nav
      className="bg-gradient-to-b from-indigo-50/50 to-transparent border-b border-indigo-200"
      role="navigation"
      aria-label="Основная навигация"
    >
      <div className="px-2 sm:px-4 pt-2">
        <div className="flex gap-0.5 items-end overflow-x-auto overflow-y-hidden scrollbar-hide">
          {navigationItems[role]?.map((item) => {
            const Icon = item.icon;
            const isActive = isPathActive(item.path);
            return (
              <button
                type="button"
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                aria-label={`Перейти к разделу: ${item.label}`}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-t-lg transition-all duration-base border-t border-l border-r relative whitespace-nowrap',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:z-20',
                  isActive
                    ? 'bg-white border-indigo-300 text-indigo-700 shadow-sm z-10 -mb-px'
                    : 'bg-indigo-50/70 border-indigo-200/50 text-gray-500 hover:bg-indigo-100/70 hover:text-indigo-600 active:scale-95'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span className="hidden xs:inline">{item.label}</span>
                <span className="xs:hidden">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
