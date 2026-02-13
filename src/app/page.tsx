'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import HorizontalNav from '@/components/navigation/HorizontalNav';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { UserRole } from '@/types/supabase';
import { getDashboardSectionFromPath, isDashboardSectionFullHeight } from '@/components/dashboard/sections';
import QueryProvider from '@/providers/QueryProvider';
import { Spinner } from '@/components/ui/Spinner';
import logger from '@/lib/logger';

const LOADING_TEXT = '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...';

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading: loading } = useAuth();
  const [currentPath, setCurrentPath] = useState('/');

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, router, user]);

  const handleNavigation = (path: string) => {
    setCurrentPath(path);
  };

  const currentSection = getDashboardSectionFromPath(currentPath);
  const useInnerPageScroll = isDashboardSectionFullHeight(currentSection);

  const fetchPlanCounts = async () => {
    if (!user) return;

    try {
      const res = await fetch(`/api/plans/count?userId=${user.user_id}`, {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        const preview = (await res.text()).slice(0, 120);
        const details = { status: res.status, contentType, preview };
        if (res.status === 401 || res.status === 403) {
          logger.warn('[home] Plan counts unavailable: unauthorized', details);
        } else if (res.status === 429) {
          logger.warn('[home] Plan counts rate-limited', details);
        } else if (res.status >= 500) {
          logger.error('[home] Failed to fetch plan counts', details);
        } else {
          logger.warn('[home] Failed to fetch plan counts', details);
        }
        return;
      }

      await res.json();
    } catch (error: unknown) {
      logger.warn('[home] fetchPlanCounts request failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-lg text-gray-700">{LOADING_TEXT}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      <DashboardHeader user={user} />
      <HorizontalNav
        role={user.role as UserRole}
        currentPath={currentPath}
        onNavigate={handleNavigation}
      />
      <QueryProvider>
        <main className={useInnerPageScroll ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          <DashboardContent
            user={user}
            currentPath={currentPath}
            fetchPlanCounts={fetchPlanCounts}
          />
        </main>
      </QueryProvider>
    </div>
  );
}
