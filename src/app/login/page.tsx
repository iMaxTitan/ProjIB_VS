'use client';

import { useAuth } from '@/lib/auth/index';
import LoginPageContent from '@/components/auth/LoginPageContent';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { 
    isLoading: authLoading, 
    isAuthenticated, 
    authErrorType, 
    login 
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Перенаправляем, если пользователь уже аутентифицирован и проверка завершена
    if (!authLoading && isAuthenticated) {
      let targetUrl = '/dashboard'; // По умолчанию '/dashboard'
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const encodedReturnUrl = searchParams.get('returnUrl');
        if (encodedReturnUrl) {
          const decodedUrl = decodeURIComponent(encodedReturnUrl);
          // Простая проверка: начинается ли с '/' и не содержит '//' или ':'
          if (decodedUrl.startsWith('/') && !decodedUrl.includes('//') && !decodedUrl.includes(':')) {
            targetUrl = decodedUrl; // Используем декодированный и проверенный URL
            console.log(`Login Page: Redirecting to valid returnUrl: ${targetUrl}`);
          } else {
             console.warn(`Login Page: Invalid returnUrl detected: ${decodedUrl}. Redirecting to /dashboard.`);
          }
        } else {
           console.log('Login Page: No returnUrl found. Redirecting to /dashboard.');
        }
      } catch (e) {
        console.error('Login Page: Error processing returnUrl. Redirecting to /dashboard.', e);
      }
      // Перенаправляем на returnUrl или на дашборд по умолчанию
      router.push(targetUrl);
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('[LoginPage] authErrorType =', authErrorType);
    let errorMessage: string | null = null;
    let showLoginButton = true;

    if (authErrorType === 'supabase_user_not_found') {
      errorMessage = 'Доступ запрещен. Ваша учетная запись не найдена в системе ReportIB. Обратитесь к администратору.';
      showLoginButton = false; 
    } else if (authErrorType === 'interaction_required') {
      errorMessage = 'Требуется вход через Microsoft.'; 
    } else if (authErrorType === 'other') {
      errorMessage = 'Произошла ошибка аутентификации.';
    }

    return (
      <LoginPageContent 
        isLoading={false} 
        error={errorMessage} 
        onLogin={login} 
        showLoginButton={showLoginButton} 
      />
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
  ); 
}