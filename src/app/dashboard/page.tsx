'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import HorizontalNav from '@/components/navigation/HorizontalNav';
import DashboardContent from '@/components/dashboard/DashboardContent';
import DashboardTiles from '@/components/dashboard/DashboardTiles';
import { UserRole } from '@/types/supabase';
import { PlansProvider } from '@/context/PlansContext';
import logger from '@/lib/logger';

export default function Dashboard() {
  const router = useRouter();
  const { user, isLoading: loading } = useAuth();
  const [currentPath, setCurrentPath] = useState('/dashboard');
  const [planCounts, setPlanCounts] = useState({
    annual: { active: 0, submitted: 0, draft: 0, returned: 0, approved: 0, completed: 0, failed: 0 },
    quarterly: { active: 0, submitted: 0, draft: 0, returned: 0, approved: 0, completed: 0, failed: 0 }
  });

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, router, user]);

  // Обработчик навигации по вкладкам
  const handleNavigation = (path: string) => {
    setCurrentPath(path);
  };

  // Обработчик клика по плитке
  const handleTileClick = (type: 'yearly' | 'quarterly') => {
    // Устанавливаем путь к планам
    setCurrentPath('/dashboard/plans');
    // Не обновляем URL, так как это просто фильтрация
  };

  const fetchPlanCounts = () => {
    if (!user) return;
    fetch(`/api/plans/count?userId=${user.user_id}`)
      .then(res => res.json())
      .then(data => {
        // Если структура совпадает с ожиданиями, просто сохраняем
        if (data && data.annual && data.quarterly) {
          setPlanCounts(data);
        }
      })
      .catch((error) => logger.error(error));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-lg text-gray-700">Загрузка...</p>
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
      <PlansProvider>
        <DashboardTiles
          currentPath={currentPath}
          user={user}
          onNavigate={handleNavigation}
          onTileClick={handleTileClick}
          planCounts={planCounts}
        />
        <main className="flex-1 overflow-y-auto">
          <DashboardContent
            user={user}
            currentPath={currentPath}
            fetchPlanCounts={fetchPlanCounts}
          />
        </main>
      </PlansProvider>
    </div>
  );
}

