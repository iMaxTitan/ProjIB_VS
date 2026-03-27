"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
  InteractionRequiredAuthError,
  EventType,
  EventMessage,
} from "@azure/msal-browser";

import { silentLoginRequest, interactiveLoginRequest } from './config';
import { initializeMsal, getUserInfo } from './msal';
import { getCurrentUser, syncServerAuthToken, setAuthStatusCookie, logout, CACHE_TTL } from './session';
import { UserInfo } from '@/types/azure';
import { logger } from '@/lib/shared/logger';

export const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authErrorType, setAuthErrorType] = useState<'none' | 'interaction_required' | 'supabase_user_not_found' | 'other'>('none');
  const msalEventCallbackId = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let mounted = true;
    let refreshTimeout: NodeJS.Timeout | null = null;

    const refreshUser = async () => {
      try {
        const msalRef = await initializeMsal();
        const acct = msalRef.getActiveAccount();
        if (acct) {
          const tokenResp = await msalRef.acquireTokenSilent({ ...silentLoginRequest, account: acct });
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

    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        logger.log('[Auth] Initialization started...');

        const msal = await initializeMsal();
        logger.log('[Auth] MSAL initialized');

        const redirectResponse = await msal.handleRedirectPromise();
        if (redirectResponse) {
          logger.log('[Auth] Redirect handled, account:', redirectResponse.account?.username);
          msal.setActiveAccount(redirectResponse.account);
        }

        if (!msalEventCallbackId.current) {
          msalEventCallbackId.current = msal.addEventCallback((message: EventMessage) => {
            if (!mounted) return;
            logger.log('[Auth] MSAL Event:', message.eventType, message.error ? message.error : '');

            switch (message.eventType) {
              case EventType.LOGIN_SUCCESS:
                logger.log('MSAL: login success');
                refreshUser();
                break;
              case EventType.LOGIN_FAILURE:
                if (message.error && message.error.message) {
                  const errorMsg = message.error.message.toLowerCase();
                  if (errorMsg.includes('user_cancelled') || errorMsg.includes('popup_window_error') ||
                    errorMsg.includes('cancelled') || errorMsg.includes('closed')) {
                    logger.log('[Auth] Login cancelled by user');
                    return;
                  }
                }
                logger.error('MSAL: login error', message.error);
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

          logger.log('[Auth] Getting user profile from Supabase...');
          const profile = await getCurrentUser();

          if (!mounted) return;

          if (profile) {
            setUser(profile);
            setIsAuthenticated(true);
            setAuthErrorType('none');
            setAuthStatusCookie(true);
            refreshTimeout = setTimeout(() => { refreshUser(); }, CACHE_TTL / 2);
          } else {
            logger.warn('[Auth] Azure session active but Supabase profile not found');
            setUser(null);
            setIsAuthenticated(false);
            setAuthErrorType('supabase_user_not_found');
            setAuthStatusCookie(false);
          }
        } else {
          setAuthErrorType('none');
          setUser(null);
          setIsAuthenticated(false);
          setAuthStatusCookie(false);
        }
      } catch (e: unknown) {
        if (mounted) {
          logger.error('[Auth] Initialization error:', e);
          const errorMessage = e instanceof Error ? e.message : String(e);
          if (errorMessage.includes('interaction_required') || errorMessage.includes('login_required')) {
            setAuthErrorType('interaction_required');
          } else {
            logger.log('[Auth] User is not authorized, showing login form');
            setAuthErrorType('none');
          }
          setAuthStatusCookie(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      if (refreshTimeout) clearTimeout(refreshTimeout);
      if (msalEventCallbackId.current) {
        initializeMsal()
          .then(msal => msal.removeEventCallback(msalEventCallbackId.current!))
          .catch((error) => logger.error(error));
        msalEventCallbackId.current = null;
      }
    };
  }, []);

  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuthErrorType('none');

    try {
      const msal = await initializeMsal();

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
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message.toLowerCase() : '';
      logger.error('[Auth] Login error:', err);

      if (errorMessage.includes('interaction_in_progress')) {
        logger.error('[Auth] Interaction still in progress detected.');
        toast.error('Browser session error. Please reload the page and try again.');
      }

      if (errorMessage.includes('user_cancelled') || errorMessage.includes('cancelled')) {
        logger.log('[Auth] Login cancelled by user');
        setAuthErrorType('none');
      } else {
        setError(err instanceof Error ? err : new Error(String(err)));
        if (errorMessage.includes('supabase') || errorMessage.includes('не найден')) {
          setAuthErrorType('supabase_user_not_found');
        }
      }
      setAuthStatusCookie(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const getToken = useCallback(async (): Promise<string | null> => {
    try {
      const msal = await initializeMsal();
      const account = msal.getActiveAccount();
      if (!account) return null;
      const response = await msal.acquireTokenSilent({ ...silentLoginRequest, account });
      return response.accessToken;
    } catch (error: unknown) {
      if (error instanceof InteractionRequiredAuthError) return null;
      logger.error('[Auth] Error getting token:', error);
      return null;
    }
  }, []);

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
