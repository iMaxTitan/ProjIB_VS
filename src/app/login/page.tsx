'use client';

import { useAuth } from '@/lib/auth/index';
import LoginPageContent from '@/components/auth/LoginPageContent';
import { Spinner } from '@/components/ui/Spinner';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import logger from '@/lib/logger';

const DEBUG_LOGS = process.env.NODE_ENV !== 'production';

const MSG_SUPABASE_USER_NOT_FOUND =
  '\u0414\u043e\u0441\u0442\u0443\u043f \u0437\u0430\u043f\u0440\u0435\u0449\u0435\u043d. \u0412\u0430\u0448\u0430 \u0443\u0447\u0435\u0442\u043d\u0430\u044f \u0437\u0430\u043f\u0438\u0441\u044c \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430 \u0432 \u0441\u0438\u0441\u0442\u0435\u043c\u0435 ReportIB. \u041e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u043a \u0430\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440\u0443.';
const MSG_INTERACTION_REQUIRED =
  '\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044f \u0432\u0445\u043e\u0434 \u0447\u0435\u0440\u0435\u0437 Microsoft.';
const MSG_AUTH_OTHER =
  '\u041f\u0440\u043e\u0438\u0437\u043e\u0448\u043b\u0430 \u043e\u0448\u0438\u0431\u043a\u0430 \u0430\u0443\u0442\u0435\u043d\u0442\u0438\u0444\u0438\u043a\u0430\u0446\u0438\u0438.';

export default function LoginPage() {
  const {
    isLoading: authLoading,
    isAuthenticated,
    authErrorType,
    login,
  } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      let targetUrl = '/';
      try {
        const searchParams = new URLSearchParams(window.location.search);
        const encodedReturnUrl = searchParams.get('returnUrl');
        if (encodedReturnUrl) {
          const decodedUrl = decodeURIComponent(encodedReturnUrl);
          if (decodedUrl.startsWith('/') && !decodedUrl.includes('//') && !decodedUrl.includes(':')) {
            targetUrl = decodedUrl;
            if (DEBUG_LOGS) logger.log(`Login Page: Redirecting to valid returnUrl: ${targetUrl}`);
          } else {
            logger.warn(`Login Page: Invalid returnUrl detected: ${decodedUrl}. Redirecting to /.`);
          }
        } else if (DEBUG_LOGS) {
          logger.log('Login Page: No returnUrl found. Redirecting to /.');
        }
      } catch (e: unknown) {
        logger.error('Login Page: Error processing returnUrl. Redirecting to /.', e);
      }

      router.push(targetUrl);
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (DEBUG_LOGS) logger.log('[LoginPage] authErrorType =', authErrorType);
    let errorMessage: string | null = null;
    let showLoginButton = true;

    if (authErrorType === 'supabase_user_not_found') {
      errorMessage = MSG_SUPABASE_USER_NOT_FOUND;
      showLoginButton = false;
    } else if (authErrorType === 'interaction_required') {
      errorMessage = MSG_INTERACTION_REQUIRED;
    } else if (authErrorType === 'other') {
      errorMessage = MSG_AUTH_OTHER;
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
      <Spinner size="lg" />
    </div>
  );
}

