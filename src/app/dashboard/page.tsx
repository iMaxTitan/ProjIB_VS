'use client';

import React, { useState, useEffect } from 'react';
import { redirect } from 'next/navigation';
import { UserInfo } from '@/types/azure';
import { getCurrentUser } from '@/lib/auth';
import DashboardHeader from '@/components/dashboard/DashboardHeader';
import HorizontalNav from '@/components/navigation/HorizontalNav';
import DashboardContent from '@/components/dashboard/DashboardContent';
import DashboardTiles from '@/components/dashboard/DashboardTiles';
import { UserRole } from '@/types/supabase';
import { PlansProvider } from '@/context/PlansContext';

export default function Dashboard() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState('/dashboard');
  const [planCounts, setPlanCounts] = useState({
    annual: { active: 0, submitted: 0, draft: 0, returned: 0, approved: 0, completed: 0, failed: 0 },
    quarterly: { active: 0, submitted: 0, draft: 0, returned: 0, approved: 0, completed: 0, failed: 0 },
    weekly: { active: 0, submitted: 0, draft: 0, returned: 0, approved: 0, completed: 0, failed: 0 }
  });


  useEffect(() => {
    async function fetchUserData() {
      try {
        const userData = await getCurrentUser();
        if (userData) {
          setUser(userData);
        } else {
          redirect('/login');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        redirect('/login');
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, []);

  // Обработчик навигации по вкладкам
  const handleNavigation = (path: string) => {
    setCurrentPath(path);
  };

  // Обработчик клика по плитке
  const handleTileClick = (type: 'yearly' | 'quarterly' | 'weekly') => {
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
        if (data && data.annual && data.quarterly && data.weekly) {
          setPlanCounts(data);
        }
      })
      .catch(console.error);
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

  if (!user) {
    redirect('/login');
    return null;
  }

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