import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import logger from '@/lib/shared/logger';

const LOGIN_ROUTE = '/login';
const CALLBACK_ROUTE = '/auth/callback';

const publicPaths = [
  LOGIN_ROUTE,
  CALLBACK_ROUTE,
  '/api/auth/token',
  '/api/telegram/webhook',
  '/api/teams/webhook',
  '/api/digest/weekly',
  '/api/voice/webhook',
  '/api/voice/kb-search',
];

function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };

    if (!payload.exp) return false;
    return payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  logger.debug(`[Middleware] Pathname: ${pathname}`);

  const isPublic = publicPaths.some((path) => pathname.startsWith(path));
  logger.debug(`[Middleware] Is public path? ${isPublic}`);
  if (isPublic) {
    logger.debug('[Middleware] Allowing public path.');
    return NextResponse.next();
  }

  if (pathname.startsWith('/_next')) {
    return NextResponse.next();
  }

  logger.debug('[Middleware] Checking auth token...');

  const authToken = request.cookies.get('auth_token')?.value;
  const hasValidAuthToken = Boolean(
    authToken &&
    authToken !== 'undefined' &&
    authToken !== 'null' &&
    !isJwtExpired(authToken)
  );

  if (!hasValidAuthToken) {
    logger.debug('[Middleware] Auth token not found, invalid, or expired.');

    // API routes и Server Actions → JSON 401 (не редирект)
    const isApiRoute = pathname.startsWith('/api/');
    const isServerAction = request.headers.has('next-action') || request.headers.has('x-invoke-path');
    if (isApiRoute || isServerAction) {
      logger.debug('[Middleware] Unauthorized API/action request. Returning 401.');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    logger.debug('[Middleware] Redirecting to login.');

    const loginUrl = new URL(LOGIN_ROUTE, request.nextUrl.origin);
    loginUrl.searchParams.set(
      'returnUrl',
      encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)
    );

    return NextResponse.redirect(loginUrl);
  }

  logger.debug('[Middleware] Auth check passed. Allowing request.');
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images (public images)
     * - login (auth page)
     * - api/auth/token (auth sync)
     */
    '/((?!_next/static|_next/image|_next/server|favicon.ico|images|login|api/auth/token).*)',
  ],
};
