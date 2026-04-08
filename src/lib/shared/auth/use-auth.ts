"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useMsal } from '@azure/msal-react';
import { InteractionRequiredAuthError, InteractionStatus } from '@azure/msal-browser';

import { silentLoginRequest, interactiveLoginRequest } from './config';
import { getUserInfo } from './msal';
import {
  getCurrentUser,
  syncServerAuthToken,
  setAuthStatusCookie,
  logout as doLogout,
} from './session';
import { UserInfo } from '@/types/azure';
import { logger } from '@/lib/shared/logger';
import { getDBAccessToken } from '@/lib/shared/db-client';

/** JWT refresh interval (40 min) and threshold (10 min before expiry) */
const REFRESH_INTERVAL_MS = 40 * 60_000;
const REFRESH_THRESHOLD_MS = 10 * 60_000;

export const useAuth = () => {
  const { instance, accounts, inProgress } = useMsal();

  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSessionReady, setIsSessionReady] = useState(false); // true when server cookie confirmed
  const [authErrorType, setAuthErrorType] = useState<
    'none' | 'interaction_required' | 'supabase_user_not_found' | 'other'
  >('none');
  const initDone = useRef(false);

  // ── Unified session refresh (replaces both old refreshUser timeout + useAuthRefresh) ──
  const refreshSession = useCallback(async () => {
    try {
      const account = instance.getActiveAccount();
      if (!account) return;
      const tokenResp = await instance.acquireTokenSilent({
        ...silentLoginRequest,
        account,
      });
      if (tokenResp?.accessToken) {
        await syncServerAuthToken(
          tokenResp.accessToken,
          account.username?.toLowerCase()
        );
      }
    } catch (e: unknown) {
      if (e instanceof InteractionRequiredAuthError) {
        logger.warn('[Auth] Session expired, interactive login required');
        setAuthErrorType('interaction_required');
        return;
      }
      logger.error('[Auth] Session refresh failed:', e);
    }
  }, [instance]);

  // ── Main init: runs once when MsalProvider finishes all interactions ──
  useEffect(() => {
    // Wait for MsalProvider to finish handling redirect / in-progress interaction
    if (inProgress !== InteractionStatus.None) return;
    if (initDone.current) return;

    let mounted = true;

    const initialize = async () => {
      try {
        setIsLoading(true);
        logger.log('[Auth] Initialization started...');

        // MsalProvider already called handleRedirectPromise — just set active account
        if (!instance.getActiveAccount() && accounts.length > 0) {
          instance.setActiveAccount(accounts[0]);
        }

        // Fast path: no MSAL accounts → user never logged in, show login immediately
        if (accounts.length === 0 && !instance.getActiveAccount()) {
          logger.log('[Auth] No cached accounts — showing login immediately');
          setUser(null);
          setIsAuthenticated(false);
          setAuthErrorType('none');
          setAuthStatusCookie(false);
          initDone.current = true;
          return;
        }

        // Fast path: if we have localStorage user cache, show UI immediately
        // (avoids waiting for acquireTokenSilent iframe timeout)
        if (typeof window !== 'undefined') {
          try {
            const cachedUserStr = localStorage.getItem('auth_user_cache');
            const cacheExpiry = localStorage.getItem('auth_user_cache_expiry');
            if (cachedUserStr && cacheExpiry && Date.now() < parseInt(cacheExpiry)) {
              const cachedUser = JSON.parse(cachedUserStr);
              if (cachedUser?.user_id && mounted) {
                logger.log('[Auth] Fast path: loaded user from localStorage cache');
                setUser(cachedUser);
                setIsAuthenticated(true);
                setAuthErrorType('none');
                setAuthStatusCookie(true);
                initDone.current = true;
                // Background: refresh Azure token + server session (non-blocking)
                refreshSession()
                  .then(() => { if (mounted) setIsSessionReady(true); })
                  .catch(() => {});
                return;
              }
            }
          } catch { /* cache miss — proceed with normal flow */ }
        }

        logger.log('[Auth] Getting Azure AD token...');
        const azureUser = await getUserInfo();
        if (!mounted) return;

        if (azureUser) {
          const serverTokenSync = await syncServerAuthToken(
            azureUser.accessToken,
            azureUser.email
          );
          if (!serverTokenSync.ok) {
            logger.warn('[Auth] Server auth cookie not set.', {
              issue: serverTokenSync.issue || 'unknown',
            });
            setUser(null);
            setIsAuthenticated(false);
            setAuthErrorType(
              serverTokenSync.issue === 'user_not_found' ||
                serverTokenSync.issue === 'email_missing'
                ? 'supabase_user_not_found'
                : 'other'
            );
            setAuthStatusCookie(false);
            return;
          }

          logger.log('[Auth] Getting user profile from DB...');
          const profile = await getCurrentUser(azureUser);
          if (!mounted) return;

          if (profile) {
            setUser(profile);
            setIsAuthenticated(true);
            setIsSessionReady(true);
            setAuthErrorType('none');
            setAuthStatusCookie(true);
          } else {
            logger.warn(
              '[Auth] Azure session active but user profile not found'
            );
            setUser(null);
            setIsAuthenticated(false);
            setAuthErrorType('supabase_user_not_found');
            setAuthStatusCookie(false);
          }
        } else {
          // No Azure session — show login
          setAuthErrorType('none');
          setUser(null);
          setIsAuthenticated(false);
          setAuthStatusCookie(false);
        }

        initDone.current = true;
      } catch (e: unknown) {
        if (!mounted) return;
        logger.error('[Auth] Initialization error:', e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        if (
          errorMessage.includes('interaction_required') ||
          errorMessage.includes('login_required')
        ) {
          setAuthErrorType('interaction_required');
        } else {
          logger.log('[Auth] User is not authorized, showing login form');
          setAuthErrorType('none');
        }
        setAuthStatusCookie(false);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initialize();
    return () => {
      mounted = false;
    };
  }, [inProgress, accounts, instance]);

  // ── Unified JWT refresh interval (replaces useAuthRefresh + refreshUser timeout) ──
  useEffect(() => {
    if (!isAuthenticated) return;

    const maybeRefresh = async () => {
      const token = getDBAccessToken();
      if (!token) return;
      try {
        const parts = token.split('.');
        if (parts.length !== 3 || !parts[1]) return;
        const payload = JSON.parse(atob(parts[1]));
        if (
          typeof payload.exp === 'number' &&
          payload.exp * 1000 - Date.now() < REFRESH_THRESHOLD_MS
        ) {
          logger.log('[Auth] JWT expiring soon, refreshing...');
          await refreshSession();
        }
      } catch {
        // retry next cycle
      }
    };

    maybeRefresh(); // check immediately
    const id = setInterval(maybeRefresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, refreshSession]);

  // ── Login ──
  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuthErrorType('none');

    try {
      // Clear stuck interaction status if any
      try {
        const keys = Object.keys(localStorage);
        const interactionKey = keys.find((key) =>
          key.includes('interaction_status')
        );
        if (
          interactionKey &&
          localStorage.getItem(interactionKey) === 'interaction_in_progress'
        ) {
          logger.warn('[Auth] Found stuck interaction status. Cleared.');
          localStorage.removeItem(interactionKey);
        }
      } catch (e: unknown) {
        logger.warn('[Auth] Failed to check/clear interaction status:', e);
      }

      logger.log('[Auth] Using redirect flow for authentication');
      await instance.loginRedirect(interactiveLoginRequest);
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message.toLowerCase() : '';
      logger.error('[Auth] Login error:', err);

      if (errorMessage.includes('interaction_in_progress')) {
        toast.error(
          'Browser session error. Please reload the page and try again.'
        );
      }

      if (
        errorMessage.includes('user_cancelled') ||
        errorMessage.includes('cancelled')
      ) {
        logger.log('[Auth] Login cancelled by user');
        setAuthErrorType('none');
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
        if (
          errorMessage.includes('supabase') ||
          errorMessage.includes('не найден')
        ) {
          setAuthErrorType('supabase_user_not_found');
        }
      }
      setAuthStatusCookie(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [instance]);

  // ── Logout ──
  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    initDone.current = false; // allow re-initialization after login
    try {
      await doLogout();
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

  // ── Token acquisition ──
  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const account = instance.getActiveAccount();
      if (!account) return null;
      const response = await instance.acquireTokenSilent({
        ...silentLoginRequest,
        account,
      });
      return response.accessToken;
    } catch (error: unknown) {
      if (error instanceof InteractionRequiredAuthError) return null;
      logger.error('[Auth] Error getting token:', error);
      return null;
    }
  }, [instance]);

  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getToken();
      return !!token;
    } catch {
      return false;
    }
  }, [getToken]);

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    isSessionReady,
    authErrorType,
    login,
    logout: handleLogout,
    getToken,
    refreshToken,
  };
};
