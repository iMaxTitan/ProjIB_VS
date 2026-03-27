import { Configuration, BrowserCacheLocation, LogLevel } from '@azure/msal-browser';

// Базовый URL приложения (fallback для SSR где нет window)
export const APP_BASE_URL = 'https://maxtitan.me';

// Динамический origin — учитывает порт (для dev на :3000)
function getOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return APP_BASE_URL;
}

// MSAL-конфиг теперь использует переменные из .env.local
export const getMsalConfig = (): Configuration => ({
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI || getOrigin(),
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_AZURE_AD_LOGOUT_REDIRECT_URI || `${getOrigin()}/login`,
    navigateToLoginRequestUrl: true
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    storeAuthStateInCookie: false
  },
  system: {
    allowRedirectInIframe: false,
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
      logLevel: LogLevel.Warning,
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
  scopes: [...baseScopes, ...sharePointScopes],
  prompt: 'select_account' as const
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
  DASHBOARD: '/',
  HOME: '/'
};
