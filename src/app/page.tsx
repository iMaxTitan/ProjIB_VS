'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/shared/auth';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import HorizontalNav from '@/components/navigation/HorizontalNav';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { UserRole } from '@/types/db-user';
import { getDashboardSectionFromPath, isDashboardSectionFullHeight } from '@/components/dashboard/sections';
import QueryProvider from '@/app/QueryProvider';
import { Spinner } from '@/components/ui/Spinner';

const LOADING_TEXT = '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430...';

export default function HomePage() {
  const router = useRouter();
  const { user, isLoading: loading, isSessionReady } = useAuth();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-lg text-slate-700">{LOADING_TEXT}</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <QueryProvider>
      <div className="flex flex-col h-screen bg-slate-100">
        <DashboardHeader user={user} isSessionReady={isSessionReady} />
        <HorizontalNav
          role={user.role as UserRole}
          currentPath={currentPath}
          onNavigate={handleNavigation}
        />
        <main className={useInnerPageScroll ? 'flex-1 min-h-0 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          <DashboardContent
            user={user}
            currentPath={currentPath}
          />
        </main>
      </div>
    </QueryProvider>
  );
}
