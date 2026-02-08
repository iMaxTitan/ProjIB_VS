import { GraphUser } from '@/types/graph-types';
import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/logger';

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
        logger.error('Отсутствует токен доступа при поиске пользователя');
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
        logger.error(`Ошибка API при поиске пользователя: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error: unknown) {
      logger.error('Ошибка при поиске пользователя:', error);
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
        logger.error('Отсутствует токен доступа при получении фото пользователя');
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
        logger.error(`Ошибка API при получении фото пользователя: ${response.status} ${response.statusText}`);
        return null;
      }

      // Получаем фото как Blob
      const photoBlob = await response.blob();

      // Конвертируем Blob в base64 и сжимаем
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = function () {
          const base64String = reader.result as string;

          // Создаем изображение для изменения размера
          const img = new Image();
          img.src = base64String;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Максимальный размер 200x200
            const MAX_WIDTH = 200;
            const MAX_HEIGHT = 200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width *= MAX_HEIGHT / height;
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;

            if (ctx) {
              ctx.drawImage(img, 0, 0, width, height);
              // Возвращаем сжатое изображение в формате JPEG с качеством 0.7
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            } else {
              // Если не удалось получить контекст, возвращаем оригинал
              resolve(base64String);
            }
          };

          img.onerror = () => {
            // Если не удалось загрузить изображение, возвращаем оригинал
            resolve(base64String);
          };
        };
        reader.readAsDataURL(photoBlob);
      });
    } catch (error: unknown) {
      logger.error('Ошибка при получении фото пользователя:', error);
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
        logger.error('Отсутствует токен доступа при получении данных пользователя');
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
        logger.error(`Ошибка API при получении данных пользователя: ${response.status} ${response.statusText}`);
        return null;
      }

      return await response.json();
    } catch (error: unknown) {
      logger.error('Ошибка при получении данных пользователя:', error);
      return null;
    }
  }
}

