import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Проверка статуса авторизации через cookie
 * MSAL работает только на клиенте, поэтому серверная проверка использует cookie
 */
export async function GET(request: NextRequest) {
  try {
    // Проверяем наличие auth-status cookie
    const authStatus = request.cookies.get('auth-status');
    const isAuthenticated = authStatus?.value === 'authenticated';

    return NextResponse.json({ isAuthenticated });
  } catch (error) {
    console.error('Ошибка проверки авторизации:', error);
    return NextResponse.json({ isAuthenticated: false, error: 'Ошибка проверки авторизации' });
  }
} 