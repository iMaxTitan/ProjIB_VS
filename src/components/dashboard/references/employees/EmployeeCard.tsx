'use client';

import Image from 'next/image';
import { cn } from '@/lib/shared/utils';
import { SupabaseUserInfo, UserStatus } from '@/types/supabase';
import ReferenceListItem from '@/components/dashboard/shared/ReferenceListItem';
import { Badge } from '@/components/ui/badge';

interface EmployeeCardProps {
  employee: SupabaseUserInfo;
  isSelected?: boolean;
  onClick?: () => void;
}

// Утилиты для отображения
const getInitials = (name: string | null): string => {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

const getAvatarGradient = (name: string | null): string => {
  if (!name) return 'from-slate-400 to-slate-500';

  const initial = name.charAt(0).toLowerCase();
  const gradients: Record<string, string> = {
    'а': 'from-rose-400 to-rose-500', a: 'from-rose-400 to-rose-500',
    'б': 'from-blue-400 to-blue-500', b: 'from-blue-400 to-blue-500',
    'в': 'from-emerald-400 to-emerald-500', c: 'from-emerald-400 to-emerald-500',
    'г': 'from-amber-400 to-amber-500', d: 'from-amber-400 to-amber-500',
    'д': 'from-violet-400 to-violet-500', e: 'from-violet-400 to-violet-500',
    'е': 'from-pink-400 to-pink-500', f: 'from-pink-400 to-pink-500',
    'ж': 'from-indigo-400 to-indigo-500', g: 'from-indigo-400 to-indigo-500',
    'з': 'from-yellow-400 to-yellow-500', h: 'from-teal-400 to-teal-500',
    'и': 'from-sky-400 to-sky-500', i: 'from-sky-400 to-sky-500',
    'к': 'from-red-400 to-red-500', k: 'from-red-400 to-red-500',
    'л': 'from-green-400 to-green-500', l: 'from-green-400 to-green-500',
    'м': 'from-purple-400 to-purple-500', m: 'from-purple-400 to-purple-500',
    'н': 'from-cyan-400 to-cyan-500', n: 'from-cyan-400 to-cyan-500',
    'о': 'from-orange-400 to-orange-500', o: 'from-orange-400 to-orange-500',
    'п': 'from-blue-400 to-indigo-500', p: 'from-blue-400 to-indigo-500',
    'р': 'from-red-400 to-rose-500', r: 'from-red-400 to-rose-500',
    'с': 'from-emerald-400 to-teal-500', s: 'from-emerald-400 to-teal-500',
    'т': 'from-teal-400 to-cyan-500', t: 'from-teal-400 to-cyan-500',
    'у': 'from-violet-400 to-purple-500', u: 'from-violet-400 to-purple-500',
  };

  return gradients[initial] || 'from-slate-400 to-slate-500';
};

const getStatusConfig = (status: UserStatus | null | undefined): { color: string; label: string; dot: string } => {
  if (status === 'blocked') return { color: 'bg-red-100 text-red-700', label: 'Заблокирован', dot: 'bg-red-500' };
  return { color: 'bg-emerald-100 text-emerald-700', label: 'Активен', dot: 'bg-emerald-500' };
};

const getRoleLabel = (role: string | null): string => {
  const roles: Record<string, string> = {
    chief: 'Руководитель',
    head: 'Начальник',
    employee: 'Сотрудник',
  };
  return roles[role || ''] || 'Сотрудник';
};

export default function EmployeeCard({ employee, isSelected = false, onClick }: EmployeeCardProps) {
  const statusConfig = getStatusConfig(employee.status as UserStatus);

  return (
    <ReferenceListItem
      tone="emerald"
      isSelected={isSelected}
      onClick={onClick || (() => {})}
      ariaLabel={`Выбрать сотрудника ${employee.full_name}`}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex-shrink-0">
          {employee.photo_base64 ? (
            <Image
              src={employee.photo_base64}
              alt=""
              width={40}
              height={40}
              unoptimized
              aria-hidden="true"
              className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-sm"
            />
          ) : (
            <div
              className={cn(
                'h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm border-2 border-white bg-gradient-to-br',
                getAvatarGradient(employee.full_name)
              )}
            >
              {getInitials(employee.full_name)}
            </div>
          )}
          <span
            className={cn('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white', statusConfig.dot)}
            aria-hidden="true"
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className={cn('text-sm font-semibold truncate', isSelected ? 'text-emerald-900' : 'text-slate-800')}>
            {employee.full_name || 'Без имени'}
          </div>
          <div className={cn('text-xs truncate flex items-center gap-1', isSelected ? 'text-emerald-700' : 'text-slate-500')}>
            <span className="truncate">{employee.position || getRoleLabel(employee.role)}</span>
            {employee.work_rate != null && employee.work_rate < 1 && (
              <Badge variant="cyan" size="sm" className="flex-shrink-0">
                {employee.work_rate}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </ReferenceListItem>
  );
}

export { getInitials, getAvatarGradient, getStatusConfig, getRoleLabel };
