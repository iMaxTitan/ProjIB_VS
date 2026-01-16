import { NextRequest, NextResponse } from 'next/server';

/**
 * API endpoint для установки куки состояния авторизации
 */
export async function POST(request: NextRequest) {
  try {
    // Получаем данные из запроса
    const { status } = await request.json();
    
    // Проверяем, что статус передан
    if (status !== 'authenticated' && status !== 'unauthenticated') {
      return NextResponse.json({ success: false, error: 'Некорректный статус аутентификации' }, { status: 400 });
    }

    // Создаем ответ
    const response = NextResponse.json({ success: true });

    // Устанавливаем куки для статуса авторизации
    // TTL 24 часа
    response.cookies.set({
      name: 'auth-status',
      value: status,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: status === 'authenticated' ? 60 * 60 * 24 : 0 // 24 часа или удаление
    });

    console.log(`[API] Cookie 'auth-status' set to: ${status}`);
    
    return response;
  } catch (error) {
    console.error('[API] Error setting auth cookie:', error);
    return NextResponse.json({ success: false, error: 'Ошибка установки куки' }, { status: 500 });
  }
}
