import { getUserInfo } from '@/lib/auth/index';

/**
 * Предоставляет статические методы для аутентификации
 * и получения токенов доступа для Microsoft Graph API.
 * Использует централизованный механизм получения информации о пользователе
 * через `getUserInfo`.
 */
export class GraphAuthService {
  /**
   * Базовый URL для запросов к Microsoft Graph API v1.0.
   */
  static readonly apiBaseUrl = 'https://graph.microsoft.com/v1.0';
  
  /**
   * Получает токен доступа для Microsoft Graph API.
   *
   * Использует стандартный механизм авторизации через `getUserInfo()` для получения токена,
   * который должен содержать необходимые разрешения (scopes) для работы с Graph API.
   *
   * @remarks
   * - Этот метод следует использовать для авторизации всех запросов к Microsoft Graph.
   * - Не вызывает MSAL напрямую, полагаясь на общую систему авторизации приложения.
   * - Возвращает `null`, если пользователь не авторизован или произошла ошибка.
   *
   * @returns {Promise<string | null>} Промис, который разрешается токеном доступа (строка)
   *                                   или `null`, если токен получить не удалось.
   */
  static async getAccessToken(): Promise<string | null> {
    try {
      // Получаем информацию о пользователе через стандартный механизм авторизации
      const userInfo = await getUserInfo();
      
      // Если есть информация о пользователе и его токен доступа
      if (userInfo && userInfo.accessToken) {
        return userInfo.accessToken;
      }
      
      console.warn('Не удалось получить accessToken: пользователь не авторизован или отсутствует токен.');
      return null;
    } catch (error) {
      console.error('Ошибка при получении токена доступа для Graph API:', error);
      return null;
    }
  }
}
