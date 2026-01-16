import { MockDataRequestOptions } from '@/types/graph-types'; 
import { GraphAuthService } from './auth-service';

interface MeetingRecording {
  id: string;
  meetingId?: string;
  createdDateTime: string;
  recordingContentUrl?: string; 
  name?: string; 
  durationInSeconds?: number; 
  size?: number; 
  url?: string; 
  // ... другие возможные поля
}

/**
 * Предоставляет статические методы для взаимодействия с данными встреч
 * (событий календаря и онлайн-встреч) и их записями через Microsoft Graph API.
 */
export class GraphMeetingsService {
  /**
   * Получает список записей для указанной онлайн-встречи.
   *
   * @param meetingId - Идентификатор онлайн-встречи (НЕ идентификатор события календаря).
   * @param options - Дополнительные параметры запроса.
   * @param options.accessToken - Токен доступа для Graph API. Если не предоставлен, будет получен автоматически.
   * @param options.useMockData - Если true, возвращает моковые (тестовые) данные вместо реального запроса к API.
   * @returns Промис, который разрешается массивом объектов записей (`MeetingRecording[]`) или пустым массивом в случае ошибки или отсутствия записей.
   *          Структура объекта записи зависит от ответа Graph API.
   */
  static async getMeetingRecordings(meetingId: string, options: MockDataRequestOptions = {}): Promise<MeetingRecording[]> {
    // Проверяем на использование тестовых данных
    if (options.useMockData === true) {
      console.log(`[Mock] Получение записей для встречи: ${meetingId}`);
      return this.getMockMeetingRecordings(meetingId);
    }

    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Отсутствует токен доступа при получении записей встречи.');
        return [];
      }

      console.log(`Получение записей для встречи: ${meetingId}`);
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/me/onlineMeetings/${meetingId}/recordings`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        // Логируем ошибку, но возвращаем пустой массив, как ожидается
        console.warn(`Ошибка API при получении записей встречи ${meetingId}: ${response.status} ${response.statusText}. Ответ: ${await response.text()}`);
        return [];
      }

      const recordingsData = await response.json();
      return recordingsData.value || []; // Graph API возвращает записи в поле value
    } catch (error) {
      console.error(`Критическая ошибка при получении записей встречи ${meetingId}:`, error);
      return [];
    }
  }

  /**
   * Генерирует и возвращает тестовый массив данных о записях встречи.
   * Используется для разработки и тестирования UI без реальных запросов к API.
   *
   * @param meetingId - Идентификатор встречи (используется для генерации ID записей).
   * @returns Массив моковых объектов записей (`MeetingRecording[]`).
   */
  static getMockMeetingRecordings(meetingId: string): MeetingRecording[] {
    // ... (код генерации моковых данных остается без изменений)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    return [
      {
        id: `recording-${meetingId}-1`,
        meetingId: meetingId,
        createdDateTime: yesterday.toISOString(),
        name: 'Запись встречи (часть 1)',
        durationInSeconds: 1800, // 30 минут
        size: 120000000, // размер в байтах
        url: `https://example.com/recordings/${meetingId}/1`,
        recordingContentUrl: `https://example.com/recordings/${meetingId}/1/content`
      },
      {
        id: `recording-${meetingId}-2`,
        meetingId: meetingId,
        createdDateTime: now.toISOString(),
        name: 'Запись встречи (часть 2)',
        durationInSeconds: 2100, // 35 минут
        size: 140000000, // размер в байтах
        url: `https://example.com/recordings/${meetingId}/2`,
        recordingContentUrl: `https://example.com/recordings/${meetingId}/2/content`
      }
    ];
  }

  /**
   * Пытается получить идентификатор онлайн-встречи (`onlineMeetingId`),
   * связанный с событием календаря Outlook.
   *
   * Использует несколько стратегий для поиска ID:
   * 1. Извлекает ID из свойства `onlineMeeting.joinUrl` события календаря.
   * 2. Ищет онлайн-встречу по `joinWebUrl`, полученному из события календаря.
   * 3. Ищет онлайн-встречу по совпадению темы (`subject`) с темой события календаря.
   *
   * @param eventId - Идентификатор события календаря Outlook.
   * @param options - Дополнительные параметры запроса.
   * @param options.accessToken - Токен доступа для Graph API. Если не предоставлен, будет получен автоматически.
   * @returns Промис, который разрешается строкой с ID онлайн-встречи, если она найдена,
   *          или `null`, если ID найти не удалось ни одним из способов.
   */
  static async getOnlineMeetingId(eventId: string, options: { accessToken?: string } = {}): Promise<string | null> {
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Отсутствует токен доступа при получении ID онлайн-встречи для события:', eventId);
        return null;
      }

      // --- Шаг 1: Получаем информацию о событии календаря ---
      console.log(`Получение данных события ${eventId} для поиска onlineMeetingId`);
      const eventResponse = await fetch(
        // Запрашиваем поля, необходимые для всех стратегий поиска
        `${GraphAuthService.apiBaseUrl}/me/events/${eventId}?$select=id,subject,onlineMeeting,onlineMeetingProvider,isOnlineMeeting`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );

      if (!eventResponse.ok) {
        console.error(`Ошибка API при получении события ${eventId}: ${eventResponse.status} ${eventResponse.statusText}. Ответ: ${await eventResponse.text()}`);
        return null;
      }
      const eventData = await eventResponse.json();

      // --- Шаг 2: Попытка извлечь ID из onlineMeeting.joinUrl ---
      if (eventData.onlineMeeting && eventData.onlineMeeting.joinUrl) {
        console.log(`Попытка извлечь meetingId из joinUrl: ${eventData.onlineMeeting.joinUrl}`);
        try {
          // Пример URL: https://teams.microsoft.com/l/meetup-join/19%3ameeting_...%40thread.v2/0?context=%7b%22Tid%22%3a%22...%22%2c%22Oid%22%3a%22...%22%7d
          // Нужная часть - между 'meetup-join/' и '/0?context'
          const meetingRegex = /meetup-join\/([^/?]+)/; // Регулярное выражение для извлечения ID
          const meetingIdMatch = eventData.onlineMeeting.joinUrl.match(meetingRegex);
          if (meetingIdMatch && meetingIdMatch[1]) {
            const decodedMeetingId = decodeURIComponent(meetingIdMatch[1]); // Декодируем ID
            console.log(`Найден meetingId (${decodedMeetingId}) в joinUrl события ${eventId}`);
            return decodedMeetingId;
          } else {
             console.warn(`Не удалось извлечь meetingId из joinUrl: ${eventData.onlineMeeting.joinUrl} для события ${eventId}`);
          }
        } catch (parseError) {
          console.warn(`Ошибка при разборе joinUrl для события ${eventId}:`, parseError);
        }
      } else {
         console.log(`Отсутствует onlineMeeting.joinUrl в данных события ${eventId}`);
      }

      // --- Шаг 3: Попытка найти встречу по joinWebUrl (если joinUrl не сработал) ---
      // Используем только валидные поля из onlineMeeting
      const joinWebUrl = eventData.onlineMeeting?.joinWebUrl; // joinWebUrl — корректное поле для поиска
      
      if (joinWebUrl) {
        console.log(`Попытка найти встречу по joinWebUrl: ${joinWebUrl}`);
        try {
          // Graph API требует одинарные кавычки в фильтре и URL должен быть закодирован
          const encodedUrl = encodeURIComponent(joinWebUrl);
          const filter = `$filter=joinWebUrl eq '${encodedUrl}'`;
          const meetingResponse = await fetch(
            `${GraphAuthService.apiBaseUrl}/me/onlineMeetings?${filter}&$select=id`, // Запрашиваем только ID
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            }
          );

          if (meetingResponse.ok) {
            const meetingsData = await meetingResponse.json();
            if (meetingsData.value && meetingsData.value.length > 0) {
              console.log(`Найден meetingId (${meetingsData.value[0].id}) по joinWebUrl для события ${eventId}`);
              return meetingsData.value[0].id;
            } else {
              console.log(`Встреча с joinWebUrl ${joinWebUrl} не найдена.`);
            }
          } else {
             console.warn(`Ошибка API при поиске встречи по joinWebUrl (${joinWebUrl}): ${meetingResponse.status} ${meetingResponse.statusText}. Ответ: ${await meetingResponse.text()}`);
          }
        } catch (filterError) {
          console.error(`Ошибка при поиске встречи по joinWebUrl (${joinWebUrl}):`, filterError);
        }
      } else {
        console.log(`Отсутствует onlineMeeting.joinWebUrl в данных события ${eventId} для поиска.`);
      }

      // --- Шаг 4: Попытка найти встречу по совпадению темы (если другие способы не сработали) ---
      if (eventData.subject) {
         console.log(`Попытка найти встречу по теме: "${eventData.subject}"`);
        try {
          // Фильтруем по теме. Тема должна точно совпадать.
           const encodedSubject = encodeURIComponent(eventData.subject.replace(/'/g, "''")); // Экранируем одинарные кавычки для OData
          const filter = `$filter=subject eq '${encodedSubject}'`;
          const meetingResponse = await fetch(
             `${GraphAuthService.apiBaseUrl}/me/onlineMeetings?${filter}&$select=id,subject`, // Запрашиваем ID и тему для проверки
            {
              method: 'GET',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            }
          );

          if (meetingResponse.ok) {
            const meetingsData = await meetingResponse.json();
             if (meetingsData.value && meetingsData.value.length > 0) {
               // Если найдено несколько встреч с одинаковой темой, берем первую.
               // Возможно, потребуется более сложная логика для выбора правильной встречи,
               // например, по времени начала/окончания, если эти данные доступны.
              console.log(`Найден meetingId (${meetingsData.value[0].id}) по теме "${eventData.subject}" для события ${eventId}`);
              return meetingsData.value[0].id;
            } else {
               console.log(`Встреча с темой "${eventData.subject}" не найдена.`);
            }
          } else {
             console.warn(`Ошибка API при поиске встречи по теме "${eventData.subject}": ${meetingResponse.status} ${meetingResponse.statusText}. Ответ: ${await meetingResponse.text()}`);
          }
        } catch (subjectError) {
          console.error(`Ошибка при поиске встречи по теме "${eventData.subject}":`, subjectError);
        }
      } else {
         console.log(`Отсутствует тема (subject) в данных события ${eventId} для поиска.`);
      }

      console.warn(`Не удалось найти onlineMeetingId для события ${eventId} ни одним из способов.`);
      return null;
    } catch (error) {
      console.error(`Критическая ошибка при получении ID онлайн-встречи для события ${eventId}:`, error);
      return null;
    }
  }
}

// [Комментарий] Исключены невалидные поля joinUrl и onlineMeetingUrl из $select и логики поиска meetingId, т.к. эти свойства отсутствуют в MS Graph API для событий календаря. Используется только onlineMeeting.joinWebUrl.
