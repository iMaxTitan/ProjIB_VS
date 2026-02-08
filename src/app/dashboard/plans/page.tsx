'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import DashboardContent from '@/components/dashboard/DashboardContent';
import { useAuth } from '@/lib/auth';

export default function PlansPage() {
  const router = useRouter();
  const { user, isLoading: loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, router, user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="mt-4 text-lg text-gray-700">Загрузка...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardContent user={user} currentPath="/dashboard/plans" />
  );
}
