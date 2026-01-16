import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Пути, которые не требуют авторизации
 */
const LOGIN_ROUTE = '/login';
const CALLBACK_ROUTE = '/auth/callback';
const HOME_ROUTE = '/';
const publicPaths = [
  LOGIN_ROUTE,       // /login
  CALLBACK_ROUTE,    // /auth/callback
  '/api/auth/token'  // Точный путь для API установки токена
];

/**
 * Middleware функция, которая проверяет авторизацию пользователя.
 * 
 * @param {NextRequest} request - Объект запроса.
 * @returns {Promise<NextResponse>} - Объект ответа.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log(`[Middleware] Pathname: ${pathname}`); // Лог 1: Какой путь пришел

  // Пропускаем публичные маршруты
  const isPublic = publicPaths.some(path => pathname.startsWith(path));
  console.log(`[Middleware] Is public path? ${isPublic}`); // Лог 2: Путь публичный?
  if (isPublic) {
    console.log('[Middleware] Allowing public path.'); // Лог 3: Пропускаем
    return NextResponse.next();
  }

  // Пропускаем корневой путь - там своя проверка
  if (pathname === HOME_ROUTE) {
    console.log('[Middleware] Allowing home path.'); // Лог 4: Пропускаем корень
    return NextResponse.next();
  }

  // Проверяем наличие и значение cookie 'auth-status'
  console.log('[Middleware] Checking auth-status cookie...'); // Лог 5: Начинаем проверку cookie
  const authStatusCookie = request.cookies.get('auth-status');

  if (authStatusCookie?.value !== 'authenticated') {
    console.log(`[Middleware] Auth status cookie not found or invalid ('${authStatusCookie?.value}'). Redirecting to login.`); // Лог 6: Редирект
    const loginUrl = new URL(LOGIN_ROUTE, request.nextUrl.origin);
    // Сохраняем URL, на который пользователь пытался перейти
    loginUrl.searchParams.set('returnUrl', encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search));
    return NextResponse.redirect(loginUrl);
  }

  // Если cookie 'auth-status' = 'authenticated', пропускаем запрос дальше
  console.log('[Middleware] Auth status cookie is valid. Allowing request.'); // Лог 8 (новый): Успешная проверка
  return NextResponse.next();
}

// Конфигурация Middleware: указываем пути, на которых он должен срабатывать
export const config = {
  matcher: [
    /*
     * Сопоставляем все пути запросов, кроме тех, что начинаются с:
     * - api (маршруты API)
     * - _next/static (статические файлы)
     * - _next/image (оптимизация изображений)
     * - favicon.ico (иконка)
     * - images (папка со статичными изображениями, если есть)
     * - / (корневой путь, обрабатывается на странице)
     * - /login (страница входа)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images|login).*)',
    // Добавляем корневой путь сюда, если хотим, чтобы middleware работал и на нем
    // '/' 
  ],
};