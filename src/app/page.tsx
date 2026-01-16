'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/index';

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isLoading, isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      {isLoading && (
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      )}
      {/* Можно добавить сообщение или оставить пустым, т.к. произойдет редирект */}
    </div>
  );
}