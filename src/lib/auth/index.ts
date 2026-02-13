"use client";

import {
  PublicClientApplication,
  AuthenticationResult,
  InteractionRequiredAuthError,
  EventType,
  EventMessage
} from "@azure/msal-browser";
import { useState, useEffect, useCallback, useRef } from 'react';

import { getMsalConfig, silentLoginRequest, interactiveLoginRequest } from './config';
import { supabase, setSupabaseSession, clearSupabaseSession } from '@/lib/supabase';
import { UserInfo, AzureUserInfo, roleLabels } from '@/types/azure';
import { UserRole } from '@/types/supabase';
import Cookies from 'js-cookie';
import { logger } from '@/lib/logger';

// MSAL РёРЅСЃС‚Р°РЅСЃ (СЃРёРЅРіР»С‚РѕРЅ)
let msalInstance: PublicClientApplication | null = null;

// РљСЌС€ РґР»СЏ РґР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
const USER_CACHE_KEY = 'auth_user_cache';
const USER_CACHE_EXPIRY_KEY = 'auth_user_cache_expiry';
const CACHE_TTL = 5 * 60 * 1000; // 5 РјРёРЅСѓС‚ РІ РјРёР»Р»РёСЃРµРєСѓРЅРґР°С…

// РРјСЏ cookie РґР»СЏ СЃС‚Р°С‚СѓСЃР° Р°РІС‚РѕСЂРёР·Р°С†РёРё
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

/**
 * РЈСЃС‚Р°РЅР°РІР»РёРІР°РµС‚ cookie РґР»СЏ СЃС‚Р°С‚СѓСЃР° Р°РІС‚РѕСЂРёР·Р°С†РёРё
 * @param isAuthenticated Р¤Р»Р°Рі Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРё
 */
export const setAuthStatusCookie = (isAuthenticated: boolean): void => {
  try {
    if (isAuthenticated) {
      // РЈСЃС‚Р°РЅР°РІР»РёРІР°РµРј cookie РЅР° 24 С‡Р°СЃР°
      Cookies.set(AUTH_STATUS_COOKIE, 'authenticated', {
        expires: 1, // 1 РґРµРЅСЊ
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
      logger.log('[Auth] Set auth-status cookie to authenticated');
    } else {
      // РЈРґР°Р»СЏРµРј cookie
      Cookies.remove(AUTH_STATUS_COOKIE, { path: '/' });
      logger.log('[Auth] Removed auth-status cookie');
    }
  } catch (error: unknown) {
    logger.error('[Auth] Error managing auth cookie:', error);
  }
};

/**
 * РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ MSAL
 */
export const initializeMsal = async (): Promise<PublicClientApplication> => {
  if (!msalInstance) {
    const config = getMsalConfig();
    msalInstance = new PublicClientApplication(config);
    await msalInstance.initialize();
  }
  return msalInstance;
};

/**
 * РћР±СЂР°Р±РѕС‚РєР° redirect РїРѕСЃР»Рµ Р°РІС‚РѕСЂРёР·Р°С†РёРё Azure AD
 */
export const handleRedirect = async (): Promise<AuthenticationResult | null> => {
  try {
    const msal = await initializeMsal();
    const response = await msal.handleRedirectPromise();
    return response;
  } catch (error: unknown) {
    logger.error('[Auth] Error handling redirect:', error);
    return null;
  }
};

/**
 * РџСЂРѕРІРµСЂСЏРµС‚ РЅР°Р»РёС‡РёРµ РїРѕС‚РµРЅС†РёР°Р»СЊРЅРѕР№ Р°РєС‚РёРІРЅРѕР№ СЃРµСЃСЃРёРё РІ Azure AD Р±РµР· РІС‹РїРѕР»РЅРµРЅРёСЏ Р·Р°РїСЂРѕСЃРѕРІ.
 */
export const hasMsalSession = async (): Promise<boolean> => {
  try {
    const msal = await initializeMsal();

    // РџСЂРѕРІРµСЂСЏРµРј РЅР°Р»РёС‡РёРµ Р°РєС‚РёРІРЅРѕРіРѕ Р°РєРєР°СѓРЅС‚Р°
    const activeAccount = msal.getActiveAccount();

    if (activeAccount) {
      return true;
    }

    // РџСЂРѕРІРµСЂСЏРµРј РЅР°Р»РёС‡РёРµ Р»СЋР±С‹С… Р°РєРєР°СѓРЅС‚РѕРІ
    const allAccounts = msal.getAllAccounts();
    if (allAccounts.length > 0) {
      msal.setActiveAccount(allAccounts[0]);
      return true;
    }

    return false;
  } catch (error: unknown) {
    logger.error('[Auth] Error checking MSAL session:', error);
    return false;
  }
};

/**
 * РџРѕР»СѓС‡Р°РµС‚ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»Рµ РёР· Azure AD
 */
export const getUserInfo = async (): Promise<AzureUserInfo | null> => {
  try {
    const msal = await initializeMsal();
    const activeAccount = msal.getActiveAccount();

    if (!activeAccount) {
      const allAccounts = msal.getAllAccounts();
      if (allAccounts.length === 0) {
        return null;
      }
      msal.setActiveAccount(allAccounts[0]);
    }

    try {
      const authResult = await msal.acquireTokenSilent(silentLoginRequest);
      const account = authResult.account;

      if (!account || !account.username) {
        return null;
      }

      return {
        id: account.localAccountId || account.homeAccountId,
        email: account.username.toLowerCase(),
        name: account.name || '',
        displayName: account.name || '',
        accessToken: authResult.accessToken
      };
    } catch (error: unknown) {
      if (error instanceof InteractionRequiredAuthError) {
        return null;
      }
      throw error;
    }
  } catch (error: unknown) {
    logger.error('[Auth] Error getting Azure user info:', error);
    return null;
  }
};

/**
 * РџРѕР»СѓС‡Р°РµС‚ РїРѕР»РЅСѓСЋ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РїРѕР»СЊР·РѕРІР°С‚РµР»Рµ (Azure + Supabase)
 */
export const getCurrentUser = async (): Promise<UserInfo | null> => {
  try {
    // РџСЂРѕРІРµСЂСЏРµРј РєСЌС€
    if (typeof window !== 'undefined') {
      const cachedUserStr = localStorage.getItem(USER_CACHE_KEY);
      const cacheExpiry = localStorage.getItem(USER_CACHE_EXPIRY_KEY);

      if (cachedUserStr && cacheExpiry) {
        const now = Date.now();
        if (now < parseInt(cacheExpiry)) {
          const cachedUser = JSON.parse(cachedUserStr);
          // РџСЂРѕРІРµСЂСЏРµРј РЅР°Р»РёС‡РёРµ РєСЂРёС‚РёС‡РµСЃРєРё РІР°Р¶РЅРѕРіРѕ user_id РґР»СЏ Presence
          if (cachedUser && cachedUser.user_id) {
            return cachedUser;
          }
          logger.log('[Auth] Cached user missing user_id, forcing refresh');
        }
      }
    }

    // Р•СЃР»Рё РєСЌС€Р° РЅРµС‚ РёР»Рё РѕРЅ СѓСЃС‚Р°СЂРµР», РґРµР»Р°РµРј Р·Р°РїСЂРѕСЃ
    const azureUser = await getUserInfo();
    if (!azureUser) return null;

    const emailCandidates = getEmailCandidates(azureUser.email);
    let userData: Record<string, unknown> | null = null;
    let lastError: unknown = null;

    // Поиск по email-кандидатам (например atbmarket.com <-> atb.ua).
    for (const candidate of emailCandidates) {
      const result = await supabase
        .from('v_user_details')
        .select('*')
        .ilike('email', candidate)
        .maybeSingle();

      if (result.error) {
        lastError = result.error;
        continue;
      }
      if (result.data) {
        userData = result.data as Record<string, unknown>;
        break;
      }
    }

    // Fallback: если email не совпал, пробуем получить профиль по user_id из custom JWT.
    if (!userData) {
      const authResult = await supabase.auth.getUser();
      const authUserId = authResult.data.user?.id;
      if (authUserId) {
        const byId = await supabase
          .from('v_user_details')
          .select('*')
          .eq('user_id', authUserId)
          .maybeSingle();
        if (byId.data && !byId.error) {
          userData = byId.data as Record<string, unknown>;
        } else if (byId.error) {
          lastError = byId.error;
        }
      }
    }

    if (lastError && !userData) {
      logger.error('[Auth] Supabase error:', lastError);
      return null;
    }

    const typedUserData = userData as (Record<string, unknown> & { user_id?: string; role?: string | null }) | null;
    if (!typedUserData || !typedUserData.user_id) {
      logger.warn('[Auth] User authenticated in Azure but not found in Supabase:', azureUser.email);
      return null;
    }

    logger.log('[Auth] User role from Supabase:', typedUserData.role, 'Type:', typeof typedUserData.role);
    const userInfo = {
      ...azureUser,
      ...(typedUserData as Record<string, unknown>),
      role_disp: typedUserData.role && roleLabels[typedUserData.role as UserRole] ? roleLabels[typedUserData.role as UserRole] : 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ',
      user_id: typedUserData.user_id
    } as UserInfo;

    // РљСЌС€РёСЂСѓРµРј СЂРµР·СѓР»СЊС‚Р°С‚
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

type ServerAuthSyncResult = {
  ok: boolean;
  issue?: string;
};

async function syncServerAuthToken(token: string, email?: string): Promise<ServerAuthSyncResult> {
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ token, ...(email ? { email } : {}) }),
    });
    if (!response.ok) return { ok: false, issue: `http_${response.status}` };

    // После hardening supabaseToken обязателен: anon доступ закрыт.
    try {
      const data = await response.json();
      if (!data?.supabaseToken) {
        logger.warn('[Auth] /api/auth/token returned no supabaseToken', {
          issue: data?.supabaseTokenIssue || 'unknown',
        });
        return { ok: false, issue: data?.supabaseTokenIssue || 'unknown' };
      }

      const ok = await setSupabaseSession(data.supabaseToken);
      if (!ok) {
        logger.error('[Auth] Failed to apply Supabase custom JWT session');
        return { ok: false, issue: 'set_session_failed' };
      }

      logger.log('[Auth] Supabase session set via custom JWT');
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
 * РћР±РЅРѕРІР»СЏРµС‚ auth_token cookie СЃРІРµР¶РёРј С‚РѕРєРµРЅРѕРј РёР· MSAL.
 * Р’С‹Р·С‹РІР°С‚СЊ РїРµСЂРµРґ API-Р·Р°РїСЂРѕСЃР°РјРё Рє server-side endpoints.
 */
export async function refreshAuthCookie(): Promise<boolean> {
  try {
    const msal = await initializeMsal();
    const account = msal.getActiveAccount();
    if (!account) {
      const allAccounts = msal.getAllAccounts();
      if (allAccounts.length === 0) return false;
      msal.setActiveAccount(allAccounts[0]);
    }

    const response = await msal.acquireTokenSilent({
      ...silentLoginRequest,
      account: msal.getActiveAccount()!,
    });

    if (!response?.accessToken) return false;
    const result = await syncServerAuthToken(response.accessToken, response.account?.username?.toLowerCase());
    return result.ok;
  } catch (error: unknown) {
    logger.error('[Auth] refreshAuthCookie failed:', error);
    return false;
  }
}

/**
 * Р’С‹С…РѕРґ РёР· СЃРёСЃС‚РµРјС‹ (Р»РѕРєР°Р»СЊРЅС‹Р№ РІС‹С…РѕРґ Р±РµР· СЂРµРґРёСЂРµРєС‚Р° РЅР° Microsoft)
 */
export const logout = async (): Promise<void> => {
  try {
    // Убираем пользователя из online-списка сразу (не ждём TTL)
    try { await fetch('/api/presence/leave', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }

    // РћС‡РёС‰Р°РµРј РєСЌС€ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(USER_CACHE_EXPIRY_KEY);
      // РћС‡РёС‰Р°РµРј РєСЌС€ Graph API С‚РѕРєРµРЅРѕРІ
      localStorage.removeItem('graph_api_token');
      localStorage.removeItem('graph_api_token_expiry');
    }

    // РћС‡РёС‰Р°РµРј Supabase-СЃРµСЃСЃРёСЋ
    await clearSupabaseSession();

    // РЈРґР°Р»СЏРµРј cookie СЃС‚Р°С‚СѓСЃР° Р°РІС‚РѕСЂРёР·Р°С†РёРё
    setAuthStatusCookie(false);

    // РћС‡РёС‰Р°РµРј MSAL СЃРµСЃСЃРёСЋ
    const msal = await initializeMsal();
    const account = msal.getActiveAccount();

    if (account) {
      // РСЃРїРѕР»СЊР·СѓРµРј logout СЃ onRedirectNavigate: return false РґР»СЏ РѕС‡РёСЃС‚РєРё Р»РѕРєР°Р»СЊРЅРѕРіРѕ РєСЌС€Р°
      // Р±РµР· РїРµСЂРµРЅР°РїСЂР°РІР»РµРЅРёСЏ РЅР° СЃС‚СЂР°РЅРёС†Сѓ Microsoft logout
      await msal.logout({
        account: account,
        onRedirectNavigate: () => {
          // Р’РѕР·РІСЂР°С‰Р°РµРј false С‡С‚РѕР±С‹ РѕСЃС‚Р°РЅРѕРІРёС‚СЊ РЅР°РІРёРіР°С†РёСЋ РЅР° Microsoft logout
          // Р›РѕРєР°Р»СЊРЅС‹Р№ РєСЌС€ MSAL РІСЃС‘ СЂР°РІРЅРѕ Р±СѓРґРµС‚ РѕС‡РёС‰РµРЅ
          return false;
        }
      });
    }

    // РЎР±СЂР°СЃС‹РІР°РµРј Р°РєС‚РёРІРЅС‹Р№ Р°РєРєР°СѓРЅС‚
    msal.setActiveAccount(null);

    logger.log('[Auth] Logout completed');
  } catch (error: unknown) {
    logger.error('[Auth] Error during logout:', error);
    // Р”Р°Р¶Рµ РїСЂРё РѕС€РёР±РєРµ СЃР±СЂР°СЃС‹РІР°РµРј Р°РєС‚РёРІРЅС‹Р№ Р°РєРєР°СѓРЅС‚
    try {
      const msal = await initializeMsal();
      msal.setActiveAccount(null);
    } catch {
      // РРіРЅРѕСЂРёСЂСѓРµРј РѕС€РёР±РєРё
    }
  }
};

/**
 * РҐСѓРє РґР»СЏ СѓРїСЂР°РІР»РµРЅРёСЏ Р°СѓС‚РµРЅС‚РёС„РёРєР°С†РёРµР№ РІ РїСЂРёР»РѕР¶РµРЅРёРё
 */
export const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authErrorType, setAuthErrorType] = useState<'none' | 'interaction_required' | 'supabase_user_not_found' | 'other'>('none');
  const msalEventCallbackId = useRef<string | null>(null);

  // РРЅРёС†РёР°Р»РёР·Р°С†РёСЏ РїСЂРё РјРѕРЅС‚РёСЂРѕРІР°РЅРёРё
  useEffect(() => {
    // РџСЂРѕРїСѓСЃРєР°РµРј РЅР° СЃРµСЂРІРµСЂРµ
    if (typeof window === 'undefined') {
      return;
    }
    let mounted = true;
    let refreshTimeout: NodeJS.Timeout | null = null;

    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        logger.log('[Auth] Initialization started...');

        // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј MSAL Рё РґРѕР±Р°РІР»СЏРµРј СЃР»СѓС€Р°С‚РµР»СЏ СЃРѕР±С‹С‚РёР№
        const msal = await initializeMsal();
        logger.log('[Auth] MSAL initialized');

        // РћР±СЂР°Р±Р°С‚С‹РІР°РµРј redirect РµСЃР»Рё РІРµСЂРЅСѓР»РёСЃСЊ РїРѕСЃР»Рµ Р°РІС‚РѕСЂРёР·Р°С†РёРё
        const redirectResponse = await msal.handleRedirectPromise();
        if (redirectResponse) {
          logger.log('[Auth] Redirect handled, account:', redirectResponse.account?.username);
          msal.setActiveAccount(redirectResponse.account);
        }

        // Р”РѕР±Р°РІР»СЏРµРј РѕР±СЂР°Р±РѕС‚С‡РёРє СЃРѕР±С‹С‚РёР№ MSAL РґР»СЏ РѕС‚СЃР»РµР¶РёРІР°РЅРёСЏ РёР·РјРµРЅРµРЅРёР№ Р°РІС‚РѕСЂРёР·Р°С†РёРё
        if (!msalEventCallbackId.current) {
          msalEventCallbackId.current = msal.addEventCallback((message: EventMessage) => {
            if (!mounted) return;

            // Р›РѕРіРёСЂСѓРµРј РІСЃРµ СЃРѕР±С‹С‚РёСЏ MSAL
            logger.log('[Auth] MSAL Event:', message.eventType, message.error ? message.error : '');

            switch (message.eventType) {
              case EventType.LOGIN_SUCCESS:
                logger.log('MSAL: login success');
                refreshUser();
                break;
              case EventType.LOGIN_FAILURE:
                // РќРµ СѓСЃС‚Р°РЅР°РІР»РёРІР°РµРј РѕС€РёР±РєСѓ РµСЃР»Рё СЌС‚Рѕ РїСЂРѕСЃС‚Рѕ РѕС‚РјРµРЅР° РїРѕР»СЊР·РѕРІР°С‚РµР»РµРј
                if (message.error && message.error.message) {
                  const errorMsg = message.error.message.toLowerCase();
                  if (errorMsg.includes('user_cancelled') ||
                    errorMsg.includes('popup_window_error') ||
                    errorMsg.includes('cancelled') ||
                    errorMsg.includes('closed')) {
                    logger.log('[Auth] Login cancelled by user');
                    return; // РќРµ РїРѕРєР°Р·С‹РІР°РµРј РѕС€РёР±РєСѓ
                  }
                }
                logger.error('MSAL: login error', message.error);
                // РћС€РёР±РєР° РѕР±СЂР°Р±Р°С‚С‹РІР°РµС‚СЃСЏ РІ login(), Р·РґРµСЃСЊ РЅРµ РґСѓР±Р»РёСЂСѓРµРј
                break;
              case EventType.LOGOUT_SUCCESS:
                logger.log('MSAL: logout success');
                setUser(null);
                setIsAuthenticated(false);
                setAuthErrorType('none');
                setAuthStatusCookie(false);
                break;
            }
          });
        }

        // РЁР°Рі 1: РџРѕР»СѓС‡Р°РµРј Azure AD С‚РѕРєРµРЅ Рё СЃРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј СЃ СЃРµСЂРІРµСЂРѕРј
        // (СЃРµСЂРІРµСЂ СЃРѕР·РґР°С‘С‚ Supabase JWT в†’ setSession РґРѕ Р·Р°РїСЂРѕСЃРѕРІ Рє Р‘Р”)
        logger.log('[Auth] Getting Azure AD token...');
        const azureUser = await getUserInfo();

        if (!mounted) return;

        if (azureUser) {
          const serverTokenSync = await syncServerAuthToken(azureUser.accessToken, azureUser.email);
          if (!serverTokenSync.ok) {
            logger.warn('[Auth] Server auth cookie was not set. Falling back to unauthenticated state.', {
              issue: serverTokenSync.issue || 'unknown',
            });
            setUser(null);
            setIsAuthenticated(false);
            if (serverTokenSync.issue === 'user_not_found' || serverTokenSync.issue === 'email_missing') {
              setAuthErrorType('supabase_user_not_found');
            } else {
              setAuthErrorType('other');
            }
            setAuthStatusCookie(false);
            return;
          }

          // РЁР°Рі 2: Supabase-СЃРµСЃСЃРёСЏ СѓСЃС‚Р°РЅРѕРІР»РµРЅР°, С‚РµРїРµСЂСЊ РјРѕР¶РЅРѕ Р·Р°РїСЂР°С€РёРІР°С‚СЊ РґР°РЅРЅС‹Рµ
          logger.log('[Auth] Getting user profile from Supabase...');
          const profile = await getCurrentUser();

          if (!mounted) return;

          if (profile) {
            setUser(profile);
            setIsAuthenticated(true);
            setAuthErrorType('none');
            setAuthStatusCookie(true);

            // РќР°СЃС‚СЂР°РёРІР°РµРј РїРµСЂРёРѕРґРёС‡РµСЃРєРѕРµ РѕР±РЅРѕРІР»РµРЅРёРµ РґР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
            refreshTimeout = setTimeout(() => {
              refreshUser();
            }, CACHE_TTL / 2);
          } else {
            logger.warn('[Auth] Azure session active but Supabase profile not found');
            setUser(null);
            setIsAuthenticated(false);
            setAuthErrorType('supabase_user_not_found');
            setAuthStatusCookie(false);
          }
        } else {
          // РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ Р°РІС‚РѕСЂРёР·РѕРІР°РЅ РІ Azure AD вЂ” СЌС‚Рѕ РќР• РѕС€РёР±РєР°
          setAuthErrorType('none');
          setUser(null);
          setIsAuthenticated(false);
          setAuthStatusCookie(false);
        }
      } catch (e: unknown) {
        if (mounted) {
          logger.error('[Auth] Initialization error:', e);
          // РџСЂРѕРІРµСЂСЏРµРј, СЌС‚Рѕ СЂРµР°Р»СЊРЅР°СЏ РѕС€РёР±РєР° РёР»Рё РїСЂРѕСЃС‚Рѕ РѕС‚СЃСѓС‚СЃС‚РІРёРµ Р°РІС‚РѕСЂРёР·Р°С†РёРё
          const errorMessage = e instanceof Error ? e.message : String(e);
          // Р•СЃР»Рё РѕС€РёР±РєР° СЃРІСЏР·Р°РЅР° СЃ interaction_required, СЌС‚Рѕ РЅРѕСЂРјР°Р»СЊРЅР°СЏ СЃРёС‚СѓР°С†РёСЏ
          if (errorMessage.includes('interaction_required') || errorMessage.includes('login_required')) {
            setAuthErrorType('interaction_required');
          } else {
            // РќРµ СѓСЃС‚Р°РЅР°РІР»РёРІР°РµРј РѕС€РёР±РєСѓ РґР»СЏ РѕР±С‹С‡РЅС‹С… СЃР»СѓС‡Р°РµРІ РѕС‚СЃСѓС‚СЃС‚РІРёСЏ Р°РІС‚РѕСЂРёР·Р°С†РёРё
            // setError(e instanceof Error ? e : new Error(String(e)));
            // setAuthErrorType('other');
            logger.log('[Auth] User is not authorized, showing login form');
            setAuthErrorType('none');
          }
          setAuthStatusCookie(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    // Р¤СѓРЅРєС†РёСЏ РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ РґР°РЅРЅС‹С… РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    const refreshUser = async () => {
      try {
        // РћР±РЅРѕРІР»СЏРµРј Azure AD С‚РѕРєРµРЅ Рё Supabase JWT РїРµСЂРµРґ Р·Р°РїСЂРѕСЃРѕРј РґР°РЅРЅС‹С…
        const msalRef = await initializeMsal();
        const acct = msalRef.getActiveAccount();
        if (acct) {
          const tokenResp = await msalRef.acquireTokenSilent({
            ...silentLoginRequest,
            account: acct,
          });
          if (tokenResp?.accessToken) {
            await syncServerAuthToken(tokenResp.accessToken, acct.username?.toLowerCase());
          }
        }

        const profile = await getCurrentUser();
        if (!mounted) return;

        if (profile) {
          setUser(profile);
          setIsAuthenticated(true);
          setAuthErrorType('none');
          setAuthStatusCookie(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          setAuthStatusCookie(false);
        }
      } catch (e: unknown) {
        logger.error('[Auth] Error refreshing user profile:', e);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;

      // РћС‡РёСЃС‚РєР° С‚Р°Р№РјР°СѓС‚Р° Рё РѕР±СЂР°Р±РѕС‚С‡РёРєР° СЃРѕР±С‹С‚РёР№ РїСЂРё СЂР°Р·РјРѕРЅС‚РёСЂРѕРІР°РЅРёРё
      if (refreshTimeout) clearTimeout(refreshTimeout);

      if (msalEventCallbackId.current) {
        initializeMsal()
          .then(msal => msal.removeEventCallback(msalEventCallbackId.current!))
          .catch((error) => logger.error(error));
        msalEventCallbackId.current = null;
      }
    };
  }, []);

  // Р’С…РѕРґ вЂ” РёСЃРїРѕР»СЊР·СѓРµРј redirect РґР»СЏ РІСЃРµС… СѓСЃС‚СЂРѕР№СЃС‚РІ
  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuthErrorType('none');

    try {
      const msal = await initializeMsal();

      // РћС‡РёСЃС‚РєР° РІРѕР·РјРѕР¶РЅС‹С… "Р·Р°Р»РёРїС€РёС…" СЃРѕСЃС‚РѕСЏРЅРёР№
      // MSAL РёРЅРѕРіРґР° РѕСЃС‚Р°РІР»СЏРµС‚ 'interaction_in_progress' РІ localStorage РїСЂРё РїСЂРµСЂС‹РІР°РЅРёРё
      // Р­С‚Рѕ Р±РµР·РѕРїР°СЃРЅС‹Р№ СЃР±СЂРѕСЃ РґР»СЏ loginRedirect
      try {
        const keys = Object.keys(localStorage);
        const interactionKey = keys.find(key => key.includes('interaction_status'));
        if (interactionKey && localStorage.getItem(interactionKey) === 'interaction_in_progress') {
          logger.warn('[Auth] Found stuck interaction status. Cleared.');
          localStorage.removeItem(interactionKey);
        }
      } catch (e: unknown) {
        logger.warn('[Auth] Failed to check/clear interaction status:', e);
      }

      logger.log('[Auth] Using redirect flow for authentication');
      await msal.loginRedirect(interactiveLoginRequest);
      // РџРѕСЃР»Рµ redirect СЃС‚СЂР°РЅРёС†Р° РїРµСЂРµР·Р°РіСЂСѓР·РёС‚СЃСЏ
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message.toLowerCase() : '';
      logger.error('[Auth] Login error:', err);

      // Р•СЃР»Рё РѕС€РёР±РєР° РІСЃРµ РµС‰Рµ interaction_in_progress, РїРѕРїСЂРѕР±СѓРµРј РµС‰Рµ СЂР°Р· РѕС‡РёСЃС‚РёС‚СЊ Рё СѓРІРµРґРѕРјРёС‚СЊ
      if (errorMessage.includes('interaction_in_progress')) {
        logger.error('[Auth] Interaction still in progress detected.');
        alert('Browser session error. Please reload the page and try again.');
        // РњС‹ РЅРµ РјРѕР¶РµРј Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІРѕСЃСЃС‚Р°РЅРѕРІРёС‚СЊСЃСЏ Р·РґРµСЃСЊ Р±РµР· РїРµСЂРµР·Р°РіСЂСѓР·РєРё, РЅРѕ РјС‹ СѓР¶Рµ РїРѕС‡РёСЃС‚РёР»Рё LS РІС‹С€Рµ.
      }

      if (errorMessage.includes('user_cancelled') || errorMessage.includes('cancelled')) {
        logger.log('[Auth] Login cancelled by user');
        setAuthErrorType('none');
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
        if (errorMessage.includes('supabase') || errorMessage.includes('РЅРµ РЅР°Р№РґРµРЅ')) {
          setAuthErrorType('supabase_user_not_found');
        }
      }
      setAuthStatusCookie(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Р’С‹С…РѕРґ (РёСЃРїРѕР»СЊР·СѓРµС‚ РѕР±С‰СѓСЋ С„СѓРЅРєС†РёСЋ logout)
  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      await logout();
      setUser(null);
      setIsAuthenticated(false);
      setAuthErrorType('none');
      setAuthStatusCookie(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // РџРѕР»СѓС‡РµРЅРёРµ С‚РѕРєРµРЅР° РґР»СЏ API Р·Р°РїСЂРѕСЃРѕРІ
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const msal = await initializeMsal();
      const account = msal.getActiveAccount();
      if (!account) return null;

      const response = await msal.acquireTokenSilent({
        ...silentLoginRequest,
        account
      });

      return response.accessToken;
    } catch (error: unknown) {
      if (error instanceof InteractionRequiredAuthError) {
        // РџСЂРё РЅРµРѕР±С…РѕРґРёРјРѕСЃС‚Рё РјРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ Р»РѕРіРёРєСѓ РґР»СЏ РёРЅС‚РµСЂР°РєС‚РёРІРЅРѕРіРѕ РїРѕР»СѓС‡РµРЅРёСЏ С‚РѕРєРµРЅР°
        return null;
      }
      logger.error('[Auth] Error getting token:', error);
      return null;
    }
  }, []);

  // РћР±РЅРѕРІР»РµРЅРёРµ С‚РѕРєРµРЅР°
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getToken();
      return !!token;
    } catch (error: unknown) {
      logger.error('[Auth] Error refreshing token:', error);
      return false;
    }
  }, [getToken]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    authErrorType,
    login,
    logout: handleLogout,
    getToken,
    refreshToken
  };
};



