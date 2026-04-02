'use client';

import { createContext, useContext, useMemo } from 'react';
import type { UserInfo } from '@/types/azure';
import { hasRole, ROLE_GROUPS } from '@/lib/shared/auth/role-groups';

interface PlansV2ContextValue {
  user: UserInfo;
  canEdit: boolean;
  isChief: boolean;
  onRefresh: () => void;
}

const Ctx = createContext<PlansV2ContextValue | null>(null);

export function PlansV2Provider({ user, onRefresh, children }: {
  user: UserInfo;
  onRefresh: () => void;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({
    user,
    canEdit: hasRole(user.role, ROLE_GROUPS.PLAN_EDITORS),
    isChief: user.role === 'chief',
    onRefresh,
  }), [user, onRefresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlansV2Ctx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlansV2Ctx must be used inside PlansV2Provider');
  return ctx;
}
