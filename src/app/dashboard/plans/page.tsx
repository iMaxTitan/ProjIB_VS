'use client';

import React, { useState, useEffect } from 'react';
import { redirect } from 'next/navigation';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { getCurrentUser } from '@/lib/auth';
import { UserInfo } from '@/types/azure';

export default function PlansPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-4 text-lg text-gray-700">Загрузка...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Доступ запрещен</h1>
          <p className="text-gray-600">У вас нет доступа к этой странице.</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardContent user={user} currentPath="/dashboard/plans" />
  );
}
