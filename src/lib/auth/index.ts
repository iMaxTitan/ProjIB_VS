"use client";

import {
  PublicClientApplication,
  AuthenticationResult,
  InteractionRequiredAuthError,
  EventType,
  EventMessage,
  AuthError
} from "@azure/msal-browser";
import { useState, useEffect, useCallback, useRef } from 'react';

import { getMsalConfig, silentLoginRequest, interactiveLoginRequest } from './config';
import { supabase } from '@/lib/supabase';
import { UserInfo, AzureUserInfo, roleLabels } from '@/types/azure';
import { UserRole } from '@/types/supabase';
import Cookies from 'js-cookie';
import { logger } from '@/lib/logger';

// MSAL инстанс (синглтон)
let msalInstance: PublicClientApplication | null = null;

// Кэш для данных пользователя
const USER_CACHE_KEY = 'auth_user_cache';
const USER_CACHE_EXPIRY_KEY = 'auth_user_cache_expiry';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут в миллисекундах

// Имя cookie для статуса авторизации
const AUTH_STATUS_COOKIE = 'auth-status';

/**
 * Устанавливает cookie для статуса авторизации
 * @param isAuthenticated Флаг аутентификации
 */
export const setAuthStatusCookie = (isAuthenticated: boolean): void => {
  try {
    if (isAuthenticated) {
      // Устанавливаем cookie на 24 часа
      Cookies.set(AUTH_STATUS_COOKIE, 'authenticated', {
        expires: 1, // 1 день
        path: '/',
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production'
      });
      logger.log('[Auth] Set auth-status cookie to authenticated');
    } else {
      // Удаляем cookie
      Cookies.remove(AUTH_STATUS_COOKIE, { path: '/' });
      logger.log('[Auth] Removed auth-status cookie');
    }
  } catch (error: unknown) {
    logger.error('[Auth] Error managing auth cookie:', error);
  }
};

/**
 * Инициализация MSAL
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
 * Обработка redirect после авторизации Azure AD
 */
export const handleRedirect = async (): Promise<AuthenticationResult | null> => {
  try {
    const msal = await initializeMsal();
    const response = await msal.handleRedirectPromise();
    return response;
  } catch (error: unknown) {
    logger.error('Ошибка при обработке redirect:', error);
    return null;
  }
};

/**
 * Проверяет наличие потенциальной активной сессии в Azure AD без выполнения запросов.
 */
export const hasMsalSession = async (): Promise<boolean> => {
  try {
    const msal = await initializeMsal();

    // Проверяем наличие активного аккаунта
    const activeAccount = msal.getActiveAccount();

    if (activeAccount) {
      return true;
    }

    // Проверяем наличие любых аккаунтов
    const allAccounts = msal.getAllAccounts();
    if (allAccounts.length > 0) {
      msal.setActiveAccount(allAccounts[0]);
      return true;
    }

    return false;
  } catch (error: unknown) {
    logger.error('Ошибка при проверке сессии MSAL:', error);
    return false;
  }
};

/**
 * Декодирует JWT токен
 */
function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Получает информацию о пользователе из Azure AD
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
    logger.error('Ошибка при получении информации о пользователе:', error);
    return null;
  }
};

/**
 * Получает полную информацию о пользователе (Azure + Supabase)
 */
export const getCurrentUser = async (): Promise<UserInfo | null> => {
  try {
    // Проверяем кэш
    if (typeof window !== 'undefined') {
      const cachedUserStr = localStorage.getItem(USER_CACHE_KEY);
      const cacheExpiry = localStorage.getItem(USER_CACHE_EXPIRY_KEY);

      if (cachedUserStr && cacheExpiry) {
        const now = Date.now();
        if (now < parseInt(cacheExpiry)) {
          const cachedUser = JSON.parse(cachedUserStr);
          // Проверяем наличие критически важного user_id для Presence
          if (cachedUser && cachedUser.user_id) {
            return cachedUser;
          }
          logger.log('[Auth] Cached user missing user_id, forcing refresh');
        }
      }
    }

    // Если кэша нет или он устарел, делаем запрос
    const azureUser = await getUserInfo();
    if (!azureUser) return null;

    // Используем ilike для регистронезависимого поиска и maybeSingle чтобы избежать ошибки 406
    const { data: userData, error } = await supabase
      .from('v_user_details')
      .select('*')
      .ilike('email', azureUser.email)
      .maybeSingle();

    if (error) {
      logger.error('[Auth] Supabase error:', error);
      return null;
    }

    // Если пользователя нет в базе (userData === null)
    if (!userData || !userData.user_id) {
      logger.warn('[Auth] User authenticated in Azure but not found in Supabase:', azureUser.email);
      return null;
    }

    logger.log('[Auth] User role from Supabase:', userData.role, 'Type:', typeof userData.role);
    const userInfo: UserInfo = {
      ...azureUser,
      ...userData,
      role_disp: userData.role && roleLabels[userData.role as UserRole] ? roleLabels[userData.role as UserRole] : 'Пользователь',
      user_id: userData.user_id
    };

    // Кэшируем результат
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(userInfo));
      localStorage.setItem(USER_CACHE_EXPIRY_KEY, (Date.now() + CACHE_TTL).toString());
    }

    return userInfo;
  } catch (error: unknown) {
    logger.error('Ошибка при получении полной информации о пользователе:', error);
    return null;
  }
};

async function syncServerAuthToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ token }),
    });
    return response.ok;
  } catch (error: unknown) {
    logger.error('[Auth] Failed to sync server auth token:', error);
    return false;
  }
}

/**
 * Выход из системы (локальный выход без редиректа на Microsoft)
 */
export const logout = async (): Promise<void> => {
  try {
    // Очищаем кэш пользователя
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_CACHE_KEY);
      localStorage.removeItem(USER_CACHE_EXPIRY_KEY);
      // Очищаем кэш Graph API токенов
      localStorage.removeItem('graph_api_token');
      localStorage.removeItem('graph_api_token_expiry');
    }

    // Удаляем cookie статуса авторизации
    setAuthStatusCookie(false);

    // Очищаем MSAL сессию
    const msal = await initializeMsal();
    const account = msal.getActiveAccount();

    if (account) {
      // Используем logout с onRedirectNavigate: return false для очистки локального кэша
      // без перенаправления на страницу Microsoft logout
      await msal.logout({
        account: account,
        onRedirectNavigate: () => {
          // Возвращаем false чтобы остановить навигацию на Microsoft logout
          // Локальный кэш MSAL всё равно будет очищен
          return false;
        }
      });
    }

    // Сбрасываем активный аккаунт
    msal.setActiveAccount(null);

    logger.log('[Auth] Выход выполнен успешно');
  } catch (error: unknown) {
    logger.error('Ошибка при выходе из системы:', error);
    // Даже при ошибке сбрасываем активный аккаунт
    try {
      const msal = await initializeMsal();
      msal.setActiveAccount(null);
    } catch {
      // Игнорируем ошибки
    }
  }
};

/**
 * Хук для управления аутентификацией в приложении
 */
export const useAuth = () => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authErrorType, setAuthErrorType] = useState<'none' | 'interaction_required' | 'supabase_user_not_found' | 'other'>('none');
  const [isMounted, setIsMounted] = useState(false);
  const msalEventCallbackId = useRef<string | null>(null);


  // Отслеживаем монтирование для предотвращения hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Инициализация при монтировании
  useEffect(() => {
    // Пропускаем на сервере
    if (typeof window === 'undefined') {
      return;
    }
    let mounted = true;
    let refreshTimeout: NodeJS.Timeout | null = null;

    const initializeAuth = async () => {
      try {
        setIsLoading(true);
        logger.log('[Auth] Начало инициализации...');

        // Инициализируем MSAL и добавляем слушателя событий
        const msal = await initializeMsal();
        logger.log('[Auth] MSAL инициализирован');

        // Обрабатываем redirect если вернулись после авторизации
        const redirectResponse = await msal.handleRedirectPromise();
        if (redirectResponse) {
          logger.log('[Auth] Обработан redirect, получен аккаунт:', redirectResponse.account?.username);
          msal.setActiveAccount(redirectResponse.account);
        }

        // Добавляем обработчик событий MSAL для отслеживания изменений авторизации
        if (!msalEventCallbackId.current) {
          msalEventCallbackId.current = msal.addEventCallback((message: EventMessage) => {
            if (!mounted) return;

            // Логируем все события MSAL
            logger.log('[Auth] MSAL Event:', message.eventType, message.error ? message.error : '');

            switch (message.eventType) {
              case EventType.LOGIN_SUCCESS:
                logger.log('MSAL: Успешный вход');
                refreshUser();
                break;
              case EventType.LOGIN_FAILURE:
                // Не устанавливаем ошибку если это просто отмена пользователем
                if (message.error && message.error.message) {
                  const errorMsg = message.error.message.toLowerCase();
                  if (errorMsg.includes('user_cancelled') ||
                    errorMsg.includes('popup_window_error') ||
                    errorMsg.includes('cancelled') ||
                    errorMsg.includes('closed')) {
                    logger.log('[Auth] Пользователь отменил вход');
                    return; // Не показываем ошибку
                  }
                }
                logger.error('MSAL: Ошибка входа', message.error);
                // Ошибка обрабатывается в login(), здесь не дублируем
                break;
              case EventType.LOGOUT_SUCCESS:
                logger.log('MSAL: Успешный выход');
                setUser(null);
                setIsAuthenticated(false);
                setAuthErrorType('none');
                setAuthStatusCookie(false);
                break;
            }
          });
        }

        // Получаем информацию о пользователе
        logger.log('[Auth] Получение данных пользователя...');
        const profile = await getCurrentUser();
        logger.log('[Auth] Данные пользователя:', profile ? 'получены' : 'null');

        if (!mounted) return;

        if (profile) {
          const tokenForServer = profile.accessToken || await getToken();
          const serverTokenSynced = tokenForServer ? await syncServerAuthToken(tokenForServer) : false;
          if (!serverTokenSynced) {
            logger.error('[Auth] Server auth cookie was not set. Falling back to unauthenticated state.');
            setUser(null);
            setIsAuthenticated(false);
            setAuthErrorType('other');
            setAuthStatusCookie(false);
            return;
          }

          setUser(profile);
          setIsAuthenticated(true);
          setAuthErrorType('none');
          setAuthStatusCookie(true);

          // Настраиваем периодическое обновление данных пользователя
          refreshTimeout = setTimeout(() => {
            refreshUser();
          }, CACHE_TTL / 2); // Обновляем данные через половину срока кэша
        } else {
          // Проверяем, есть ли активная Azure сессия
          // Если Azure сессия есть (getUserInfo вернул данные), но profile === null (выше),
          // значит, пользователя нет в базе -> ошибка доступа
          const azureUser = await getUserInfo();
          if (azureUser) {
            logger.warn('[Auth] Azure session active but Supabase profile not found');
            setAuthErrorType('supabase_user_not_found');
          } else {
            // Пользователь просто не авторизован - это НЕ ошибка
            setAuthErrorType('none');
          }

          setUser(null);
          setIsAuthenticated(false);
          setAuthStatusCookie(false);
        }
      } catch (e: unknown) {
        if (mounted) {
          logger.error('[Auth] Ошибка инициализации:', e);
          // Проверяем, это реальная ошибка или просто отсутствие авторизации
          const errorMessage = e instanceof Error ? e.message : String(e);
          // Если ошибка связана с interaction_required, это нормальная ситуация
          if (errorMessage.includes('interaction_required') || errorMessage.includes('login_required')) {
            setAuthErrorType('interaction_required');
          } else {
            // Не устанавливаем ошибку для обычных случаев отсутствия авторизации
            // setError(e instanceof Error ? e : new Error(String(e)));
            // setAuthErrorType('other');
            logger.log('[Auth] Пользователь не авторизован, показываем форму входа');
            setAuthErrorType('none');
          }
          setAuthStatusCookie(false);
        }
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    // Функция для обновления данных пользователя
    const refreshUser = async () => {
      try {
        const profile = await getCurrentUser();
        if (!mounted) return;

        if (profile) {
          const tokenForServer = profile.accessToken || await getToken();
          const serverTokenSynced = tokenForServer ? await syncServerAuthToken(tokenForServer) : false;
          if (!serverTokenSynced) {
            setUser(null);
            setIsAuthenticated(false);
            setAuthErrorType('other');
            setAuthStatusCookie(false);
            return;
          }

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
        logger.error('Ошибка при обновлении данных пользователя:', e);
      }
    };

    initializeAuth();

    return () => {
      mounted = false;

      // Очистка таймаута и обработчика событий при размонтировании
      if (refreshTimeout) clearTimeout(refreshTimeout);

      if (msalEventCallbackId.current) {
        initializeMsal()
          .then(msal => msal.removeEventCallback(msalEventCallbackId.current!))
          .catch((error) => logger.error(error));
        msalEventCallbackId.current = null;
      }
    };
  }, []);

  // Вход — используем redirect для всех устройств
  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setAuthErrorType('none');

    try {
      const msal = await initializeMsal();

      // Очистка возможных "залипших" состояний
      // MSAL иногда оставляет 'interaction_in_progress' в localStorage при прерывании
      // Это безопасный сброс для loginRedirect
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

      logger.log('[Auth] Используем redirect для авторизации');
      await msal.loginRedirect(interactiveLoginRequest);
      // После redirect страница перезагрузится
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message.toLowerCase() : '';
      logger.error('[Auth] Ошибка входа:', err);

      // Если ошибка все еще interaction_in_progress, попробуем еще раз очистить и уведомить
      if (errorMessage.includes('interaction_in_progress')) {
        logger.error('[Auth] Interaction still in progress detected.');
        alert('Произошла ошибка сессии браузера. Пожалуйста, обновите страницу и попробуйте снова.');
        // Мы не можем автоматически восстановиться здесь без перезагрузки, но мы уже почистили LS выше.
      }

      if (errorMessage.includes('user_cancelled') || errorMessage.includes('cancelled')) {
        logger.log('[Auth] Пользователь отменил вход');
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

  // Выход (использует общую функцию logout)
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

  // Получение токена для API запросов
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
        // При необходимости можно добавить логику для интерактивного получения токена
        return null;
      }
      logger.error('Ошибка при получении токена:', error);
      return null;
    }
  }, []);

  // Обновление токена
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const token = await getToken();
      return !!token;
    } catch (error: unknown) {
      logger.error('Ошибка при обновлении токена:', error);
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


