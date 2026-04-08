import { Configuration, BrowserCacheLocation, LogLevel } from '@azure/msal-browser';

// Базовый URL приложения (fallback для SSR где нет window)
export const APP_BASE_URL = 'https://maxtitan.me';

// Динамический origin — учитывает порт (для dev на :3000)
function getOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return APP_BASE_URL;
}

// Blank page для silent token acquisition (iframe не грузит Next.js роутер)
export function getSilentRedirectUri(): string {
  return `${getOrigin()}/blank.html`;
}

// MSAL-конфиг — v5 compatible
export const getMsalConfig = (): Configuration => ({
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_AD_TENANT_ID}`,
    redirectUri: process.env.NEXT_PUBLIC_AZURE_AD_REDIRECT_URI || `${getOrigin()}/login`,
    postLogoutRedirectUri: process.env.NEXT_PUBLIC_AZURE_AD_LOGOUT_REDIRECT_URI || `${getOrigin()}/login`,
    // navigateToLoginRequestUrl moved to handleRedirectPromise() options in v5
  },
  cache: {
    cacheLocation: BrowserCacheLocation.LocalStorage,
    // storeAuthStateInCookie removed in v5
  },
  system: {
    // v5: iframeHashTimeout/loadFrameTimeout → iframeBridgeTimeout/popupBridgeTimeout
    iframeBridgeTimeout: 5000,
    popupBridgeTimeout: 5000,
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error(message);
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

// Параметры для silent-запроса (redirectUri вычисляется динамически через getSilentRedirectUri)
export const getSilentLoginRequest = () => ({
  scopes: [...baseScopes, ...sharePointScopes],
  redirectUri: getSilentRedirectUri(),
});

/** @deprecated Use getSilentLoginRequest() — this is evaluated once at import time */
export const silentLoginRequest = {
  scopes: [...baseScopes, ...sharePointScopes],
  get redirectUri() { return getSilentRedirectUri(); },
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
