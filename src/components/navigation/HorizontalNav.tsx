'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { UserRole } from '@/types/supabase';
import {
  Zap,
  Calendar,
  CalendarDays,
  FileText,
  BarChart3,
  BookOpen,
  PieChart,
  Bot,
  Database,
  UserCircle,
  Network,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/shared/utils';

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
  { label: 'Активність', path: '/', icon: Zap },
  { label: 'Плани', path: '/plans', icon: Calendar },
  { label: 'Плани 2', path: '/plans-v2', icon: Network },
  { label: 'Планувальник', path: '/planner', icon: CalendarDays },
  { label: 'Отчеты', path: '/reports', icon: FileText },
  { label: 'Сводная', path: '/summary', icon: PieChart },
  { label: 'KPI', path: '/kpi', icon: BarChart3 },
  { label: 'Справочники', path: '/references', icon: BookOpen },
  { label: 'База знань', path: '/kb', icon: Database },
  { label: 'Бот', path: '/bot', icon: Bot },
  { label: 'Кабінет', path: '/cabinet', icon: UserCircle },
];

// Пункты меню для начальника отдела (head)
const headNavItems: NavItem[] = [
  { label: 'Активність', path: '/', icon: Zap },
  { label: 'Плани', path: '/plans', icon: Calendar },
  { label: 'Плани 2', path: '/plans-v2', icon: Network },
  { label: 'Планувальник', path: '/planner', icon: CalendarDays },
  { label: 'Отчеты', path: '/reports', icon: FileText },
  { label: 'Сводная', path: '/summary', icon: PieChart },
  { label: 'KPI', path: '/kpi', icon: BarChart3 },
  { label: 'Справочники', path: '/references', icon: BookOpen },
  { label: 'База знань', path: '/kb', icon: Database },
  { label: 'Кабінет', path: '/cabinet', icon: UserCircle },
];

// Пункты меню для аналитика (analyst) — employee + отчёты, справочники
const analystNavItems: NavItem[] = [
  { label: 'Активність', path: '/', icon: Zap },
  { label: 'Плани', path: '/plans', icon: Calendar },
  { label: 'Плани 2', path: '/plans-v2', icon: Network },
  { label: 'Планувальник', path: '/planner', icon: CalendarDays },
  { label: 'Отчеты', path: '/reports', icon: FileText },
  { label: 'Справочники', path: '/references', icon: BookOpen },
  { label: 'Кабінет', path: '/cabinet', icon: UserCircle },
];

// Пункты меню для сотрудника (employee)
const employeeNavItems: NavItem[] = [
  { label: 'Активність', path: '/', icon: Zap },
  { label: 'Плани', path: '/plans', icon: Calendar },
  { label: 'Плани 2', path: '/plans-v2', icon: Network },
  { label: 'Планувальник', path: '/planner', icon: CalendarDays },
  { label: 'Кабінет', path: '/cabinet', icon: UserCircle },
];

const navigationItems: Record<UserRole, Array<NavItem>> = {
  chief: chiefNavItems,
  head: headNavItems,
  analyst: analystNavItems,
  employee: employeeNavItems,
  kb_user: [], // kb_user не заходит на сайт
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
                  'flex items-center gap-2 px-3 sm:px-4 py-2 text-sm font-medium rounded-t-lg transition-[transform,background-color] duration-base border-t border-l border-r relative whitespace-nowrap',
                  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:z-20',
                  isActive
                    ? 'bg-white border-indigo-300 text-indigo-700 shadow-sm z-10 -mb-px'
                    : 'bg-indigo-50/70 border-indigo-200/50 text-slate-500 hover:bg-indigo-100/70 hover:text-indigo-600 active:scale-95'
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
