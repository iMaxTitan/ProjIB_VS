'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/types/supabase';
import {
  Zap,
  Calendar,
  FileText,
  BarChart3,
  CheckSquare,
  Users,
  Building2,
  TrendingUp,
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
  { label: 'Задачи', path: '/dashboard/tasks', icon: CheckSquare },
  { label: 'Отчеты', path: '/dashboard/reports', icon: FileText },
  { label: 'KPI', path: '/dashboard/kpi', icon: BarChart3 },
  { label: 'Сотрудники', path: '/dashboard/employees', icon: Users },
  { label: 'Предприятия', path: '/dashboard/companies', icon: Building2 },
  { label: 'Коэффициенты', path: '/dashboard/coefficients', icon: TrendingUp }
];

// Пункты меню для начальника отдела (head)
const headNavItems: NavItem[] = [
  { label: 'Активность', path: '/dashboard', icon: Zap },
  { label: 'Планы', path: '/dashboard/plans', icon: Calendar },
  { label: 'Задачи', path: '/dashboard/tasks', icon: CheckSquare },
  { label: 'Отчеты', path: '/dashboard/reports', icon: FileText },
  { label: 'KPI', path: '/dashboard/kpi', icon: BarChart3 },
  { label: 'Сотрудники', path: '/dashboard/employees', icon: Users },
  { label: 'Коэффициенты', path: '/dashboard/coefficients', icon: TrendingUp }
];

// Пункты меню для сотрудника (employee)
const employeeNavItems: NavItem[] = [
  { label: 'Активность', path: '/dashboard', icon: Zap },
  { label: 'Планы', path: '/dashboard/plans', icon: Calendar },
  { label: 'Задачи', path: '/dashboard/tasks', icon: CheckSquare },
  { label: 'Отчеты', path: '/dashboard/reports', icon: FileText },
  { label: 'KPI', path: '/dashboard/kpi', icon: BarChart3 },
  { label: 'Коэффициенты', path: '/dashboard/coefficients', icon: TrendingUp }
];

const navigationItems: Record<UserRole, Array<NavItem>> = {
  chief: chiefNavItems,
  head: headNavItems,
  employee: employeeNavItems
};

export default function HorizontalNav({ role, currentPath, onNavigate }: HorizontalNavProps) {
  const pathname = usePathname();

  // Используем currentPath если передан, иначе pathname
  const activePath = currentPath || pathname;

  const isPathActive = (path: string) => {
    return activePath === path;
  };

  const handleNavigation = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
      // URL не обновляем - всё работает внутри одного дашборда
    }
  };

  return (
    <nav className="bg-gradient-to-b from-indigo-50/50 to-transparent border-b border-indigo-200">
      <div className="px-4 pt-2">
        <div className="flex flex-wrap gap-0.5 items-end">
          {navigationItems[role]?.map((item) => {
            const Icon = item.icon;
            const isActive = isPathActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-all border-t border-l border-r relative whitespace-nowrap",
                  isActive
                    ? "bg-white border-indigo-300 text-indigo-700 shadow-sm z-10 -mb-px"
                    : "bg-indigo-50/70 border-indigo-200/50 text-gray-500 hover:bg-indigo-100/70 hover:text-indigo-600"
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
