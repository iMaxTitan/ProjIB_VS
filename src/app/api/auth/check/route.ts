import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import logger from '@/lib/logger';

/**
 * Проверка статуса авторизации через cookie.
 * MSAL работает на клиенте, поэтому на сервере проверяем cookie.
 */
export async function GET(request: NextRequest) {
  try {
    // Проверяем cookie auth-status
    const authStatus = request.cookies.get('auth-status');
    const isAuthenticated = authStatus?.value === 'authenticated';

    return NextResponse.json({ isAuthenticated });
  } catch (error: unknown) {
    logger.error('Ошибка проверки авторизации:', error);
    return NextResponse.json({ isAuthenticated: false, error: 'Ошибка проверки авторизации' });
  }
} 

