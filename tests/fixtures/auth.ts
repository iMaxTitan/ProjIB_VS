import { Page, BrowserContext } from '@playwright/test';
import { getTestUser } from './test-users';

/**
 * Generates a mock JWT token that passes middleware validation.
 * Middleware only checks: 3-part format + exp not expired. No signature check.
 */
export function generateMockJWT(payload: Record<string, unknown>): string {
  const header = { alg: 'none', typ: 'JWT' };

  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60 * 24, // 24 hours
  };

  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  return `${encode(header)}.${encode(jwtPayload)}.mock`;
}

/**
 * Builds the UserInfo object that gets cached in localStorage.
 * Matches the shape expected by src/lib/auth/index.ts getCurrentUser().
 */
function buildUserCacheData() {
  const user = getTestUser();
  const roleLabels: Record<string, string> = {
    chief: 'Руководитель',
    head: 'Начальник отдела',
    employee: 'Сотрудник',
  };

  return {
    id: user.userId,
    email: user.email,
    name: user.fullName,
    displayName: user.fullName,
    accessToken: 'mock-access-token',
    role: user.role,
    role_disp: roleLabels[user.role] || 'Пользователь',
    user_id: user.userId,
    department_name: user.departmentName || null,
    department_id: user.departmentId || null,
    company_id: user.companyId || null,
  };
}

/**
 * Authenticates a Playwright page by injecting:
 * 1. auth_token cookie (mock JWT) — passes middleware
 * 2. auth_user_cache in localStorage — provides user data to useAuth hook
 */
export async function authenticateAs(page: Page): Promise<void> {
  const user = getTestUser();
  if (!user.userId || !user.email) {
    throw new Error(
      'Test user not configured. Fill in .env.test with your Supabase user data.'
    );
  }

  const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://maxtitan.me:3000';
  const url = new URL(baseURL);

  // 1. Set auth_token cookie
  const token = generateMockJWT({
    sub: user.userId,
    email: user.email,
    role: user.role,
  });

  await page.context().addCookies([
    {
      name: 'auth_token',
      value: token,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
    {
      name: 'auth-status',
      value: 'authenticated',
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  // 2. Inject localStorage user cache (need to navigate first)
  await page.goto(baseURL, { waitUntil: 'commit' });

  const cacheData = buildUserCacheData();
  const cacheExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

  await page.evaluate(
    ({ data, expiry }) => {
      localStorage.setItem('auth_user_cache', JSON.stringify(data));
      localStorage.setItem('auth_user_cache_expiry', expiry.toString());
    },
    { data: cacheData, expiry: cacheExpiry }
  );
}

/**
 * Saves the browser's storageState (cookies + localStorage) to a file
 * for reuse across tests.
 */
export async function saveAuthState(
  context: BrowserContext,
  path: string
): Promise<void> {
  await context.storageState({ path });
}

/**
 * Clears authentication state.
 */
export async function clearAuth(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
