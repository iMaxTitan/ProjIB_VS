"use client";

import Cookies from 'js-cookie';
import { supabase, setDBSession, clearDBSession } from '@/lib/shared/db-client';
import { UserInfo, roleLabels } from '@/types/azure';
import { UserRole } from '@/types/db-user';
import { logger } from '@/lib/shared/logger';
import { getUserInfo, getMsalInstance, getMsalInitPromise } from './msal';

const USER_CACHE_KEY = 'auth_user_cache';
const USER_CACHE_EXPIRY_KEY = 'auth_user_cache_expiry';
export const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const AUTH_STATUS_COOKIE = 'auth-status';

function getEmailCandidates(email: string | null | undefined): string[] {
  if (!email) return [];
  const normalized = email.trim().toLowerCase();
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return [normalized];
  const candidates = new Set<string>([normalized]);
  if (domain === 'atbmarket.com') candidates.add(`${local}@atb.ua`);
  if (domain === 'atb.ua') candidates.add(`${local}@atbmarket.com`);
  return Array.from(candidates);
}

export const setAuthStatusCookie = (isAuthenticated: boolean): void => {
  try {
    if (isAuthenticated) {
      Cookies.set(AUTH_STATUS_COOKIE, 'authenticated', {
        expires: 1,
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
      logger.log('[Auth] Set auth-status cookie to authenticated');
    } else {
      Cookies.remove(AUTH_STATUS_COOKIE, { path: '/' });
      logger.log('[Auth] Removed auth-status cookie');
    }
  } catch (error: unknown) {
    logger.error('[Auth] Error managing auth cookie:', error);
  }
};

export type ServerAuthSyncResult = { ok: boolean; issue?: string };

export async function syncServerAuthToken(token: string, email?: string): Promise<ServerAuthSyncResult> {
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token, ...(email ? { email } : {}) }),
    });
    if (!response.ok) return { ok: false, issue: `http_${response.status}` };

    try {
      const data = await response.json();
      if (!data?.supabaseToken) {
        logger.warn('[Auth] /api/auth/token returned no supabaseToken', {
          issue: data?.supabaseTokenIssue || 'unknown',
        });
        return { ok: false, issue: data?.supabaseTokenIssue || 'unknown' };
      }

      const ok = await setDBSession(data.supabaseToken);
      if (!ok) {
        logger.error('[Auth] Failed to apply custom JWT session');
        return { ok: false, issue: 'set_session_failed' };
      }
      logger.log('[Auth] DB session set via custom JWT');
    } catch {
      logger.error('[Auth] Failed to parse /api/auth/token JSON response');
      return { ok: false, issue: 'invalid_json' };
    }

    return { ok: true };
  } catch (error: unknown) {
    logger.error('[Auth] Failed to sync server auth token:', error);
    return { ok: false, issue: 'fetch_failed' };
  }
}

/**
 * Get current user profile. If azureUserHint is provided, skips redundant getUserInfo() call.
 */
export const getCurrentUser = async (azureUserHint?: { email: string; id: string; name: string; displayName: string; accessToken: string } | null): Promise<UserInfo | null> => {
  try {
    if (typeof window !== 'undefined') {
      const cachedUserStr = localStorage.getItem(USER_CACHE_KEY);
      const cacheExpiry = localStorage.getItem(USER_CACHE_EXPIRY_KEY);
      if (cachedUserStr && cacheExpiry) {
        const now = Date.now();
        if (now < parseInt(cacheExpiry)) {
          const cachedUser = JSON.parse(cachedUserStr);
          if (cachedUser && cachedUser.user_id) return cachedUser;
          logger.log('[Auth] Cached user missing user_id, forcing refresh');
        }
      }
    }

    const azureUser = azureUserHint ?? await getUserInfo();
    if (!azureUser) return null;

    const emailCandidates = getEmailCandidates(azureUser.email);
    let userData: Record<string, unknown> | null = null;
    let lastError: unknown = null;

    for (const candidate of emailCandidates) {
      const result = await supabase
        .from('v_user_details')
        .select('*')
        .ilike('email', candidate)
        .maybeSingle();
      if (result.error) { lastError = result.error; continue; }
      if (result.data) { userData = result.data as Record<string, unknown>; break; }
    }

    if (!userData) {
      const authResult = await supabase.auth.getUser();
      const authUserId = (authResult.data.user as { id?: string } | null)?.id;
      if (authUserId) {
        const byId = await supabase.from('v_user_details').select('*').eq('user_id', authUserId).maybeSingle();
        if (byId.data && !byId.error) userData = byId.data as Record<string, unknown>;
        else if (byId.error) lastError = byId.error;
      }
    }

    if (lastError && !userData) { logger.error('[Auth] DB error:', lastError); return null; }

    const typedUserData = userData as (Record<string, unknown> & { user_id?: string; role?: string | null }) | null;
    if (!typedUserData || !typedUserData.user_id) {
      logger.warn('[Auth] User authenticated in Azure but not found in DB:', azureUser.email);
      return null;
    }

    logger.log('[Auth] User role from DB:', typedUserData.role, 'Type:', typeof typedUserData.role);
    const userInfo = {
      ...azureUser,
      ...(typedUserData as Record<string, unknown>),
      role_disp: typedUserData.role && roleLabels[typedUserData.role as UserRole] ? roleLabels[typedUserData.role as UserRole] : 'Пользователь',
      user_id: typedUserData.user_id
    } as UserInfo;

    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userInfo));
      localStorage.setItem(USER_CACHE_EXPIRY_KEY, (Date.now() + CACHE_TTL).toString());
    }

    return userInfo;
  } catch (error: unknown) {
    logger.error('[Auth] Error getting current user:', error);
    return null;
  }
};

export const logout = async (): Promise<void> => {
  try {
    try { await fetch('/api/presence/leave', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }

    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(USER_CACHE_EXPIRY_KEY);
      localStorage.removeItem('graph_api_token');
      localStorage.removeItem('graph_api_token_expiry');
    }

    await clearDBSession();
    setAuthStatusCookie(false);

    await getMsalInitPromise();
    const msal = getMsalInstance();
    const account = msal.getActiveAccount();

    if (account) {
      // v5: logoutRedirect() navigates away — code after it won't execute
      await msal.logoutRedirect({
        account: account,
        postLogoutRedirectUri: `${window.location.origin}/login`,
      });
      return;
    }

    msal.setActiveAccount(null);
    logger.log('[Auth] Logout completed (no active account)');
  } catch (error: unknown) {
    logger.error('[Auth] Error during logout:', error);
    try {
      await getMsalInitPromise();
      getMsalInstance().setActiveAccount(null);
    } catch { /* ignore */ }
  }
};
