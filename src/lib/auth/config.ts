import { Configuration, BrowserCacheLocation, LogLevel } from '@azure/msal-browser';

// Базовый URL приложения
export const APP_BASE_URL = 'https://maxtitan.me:3000';

// MSAL-конфиг теперь использует переменные из .env.local
export const getMsalConfig = (): Configuration => ({
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI || APP_BASE_URL,
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_AZURE_AD_LOGOUT_REDIRECT_URI || `${APP_BASE_URL}/login`,
    navigateToLoginRequestUrl: true
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: true
  },
  system: {
    allowRedirectInIframe: true,
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
        }
      },
      logLevel: LogLevel.Info,
      piiLoggingEnabled: false,
    }
  }
});

// Параметры запроса авторизации для интерактивного входа
export const interactiveLoginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read']
};

// Параметры для silent-запроса
export const silentLoginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
  prompt: 'none' as const
};

// Константы для маршрутов
export const ROUTES = {
  LOGIN: '/login',
  CALLBACK: '/auth/callback',
  DASHBOARD: '/dashboard',
  HOME: '/'
};
