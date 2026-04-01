'use client';

import { Ban, Ellipsis, Loader, CheckCheck } from 'lucide-react';

export type PlanStatus = 'none' | 'pending' | 'active' | 'done';

export const STATUS_ICON_MAP: Record<PlanStatus, { Icon: typeof Ban; cls: string; title: string }> = {
  none:    { Icon: Ban,        cls: 'text-slate-300',   title: 'Немає плану' },
  pending: { Icon: Ellipsis,   cls: 'text-amber-500',   title: 'Не затверджено' },
  active:  { Icon: Loader,     cls: 'text-indigo-500',  title: 'В роботі' },
  done:    { Icon: CheckCheck,  cls: 'text-emerald-500', title: 'Виконано' },
};
