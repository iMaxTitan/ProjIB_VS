import { GraphUser } from '@/types/graph-types';
import { GraphAuthService } from './auth-service';

/**
 * Класс для работы с пользователями через Microsoft Graph API
 */
export class GraphUsersService {
  /**
   * Поиск пользователя в Microsoft Graph по email
   * @param emailToSearch Email для поиска
   * @returns Массив найденных пользователей
   */
  static async searchUserByEmail(emailToSearch: string): Promise<GraphUser[]> {
    try {
      // Получаем токен доступа для запроса
      const token = await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Отсутствует токен доступа при поиске пользователя');
        return [];
      }

      // Выполняем запрос к API
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/users?$filter=mail eq '${emailToSearch}' or userPrincipalName eq '${emailToSearch}'&$select=id,displayName,mail,userPrincipalName,jobTitle,department`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`Ошибка API при поиске пользователя: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('Ошибка при поиске пользователя:', error);
      return [];
    }
  }

  /**
   * Получение фото пользователя по ID
   * @param userId ID пользователя
   * @returns URL фотографии в формате base64 или null
   */
  static async getUserPhoto(userId: string): Promise<string | null> {
    try {
      const token = await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Отсутствует токен доступа при получении фото пользователя');
        return null;
      }

      // Запрашиваем фото пользователя
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/users/${userId}/photo/$value`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        // Если фото не найдено (обычная ситуация для новых пользователей), возвращаем null без ошибки
        if (response.status === 404) {
          return null;
        }
        console.error(`Ошибка API при получении фото пользователя: ${response.status} ${response.statusText}`);
        return null;
      }

      // Получаем фото как Blob
      const photoBlob = await response.blob();

      // Конвертируем Blob в base64
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = function() {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(photoBlob);
      });
    } catch (error) {
      console.error('Ошибка при получении фото пользователя:', error);
      return null;
    }
  }

  /**
   * Получает данные текущего пользователя
   * @param options Дополнительные параметры (токен доступа)
   * @returns Данные пользователя или null, если не удалось получить
   */
  static async getUserData(options: { accessToken?: string } = {}): Promise<GraphUser | null> {
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Отсутствует токен доступа при получении данных пользователя');
        return null;
      }

      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/me?$select=id,displayName,mail,userPrincipalName,jobTitle,department`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        console.error(`Ошибка API при получении данных пользователя: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Ошибка при получении данных пользователя:', error);
      return null;
    }
  }
}
