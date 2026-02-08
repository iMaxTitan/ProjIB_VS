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

// Базовые scopes для авторизации
const baseScopes = ['openid', 'profile', 'email', 'User.Read'];

// SharePoint scopes для работы с файлами
// Требуют admin consent в Azure AD
const sharePointScopes = ['Sites.ReadWrite.All', 'Files.ReadWrite.All'];

// Параметры запроса авторизации для интерактивного входа
export const interactiveLoginRequest = {
  scopes: [...baseScopes, ...sharePointScopes]
};

// Параметры для silent-запроса
export const silentLoginRequest = {
  scopes: [...baseScopes, ...sharePointScopes],
  prompt: 'none' as const
};

// Экспорт scopes для использования в сервисах
export const SHAREPOINT_SCOPES = sharePointScopes;

// Константы для маршрутов
export const ROUTES = {
  LOGIN: '/login',
  CALLBACK: '/auth/callback',
  DASHBOARD: '/dashboard',
  HOME: '/'
};
