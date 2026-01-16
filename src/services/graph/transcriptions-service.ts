import { TranscriptionsRequestOptions } from '@/types/graph-types';
import { GraphAuthService } from './auth-service';
import { GraphMeetingsService } from './meetings-service';

/**
 * Определяет структуру метаданных транскрипции, возвращаемую Graph API.
 */
interface TranscriptionMetadata {
  id: string; // Идентификатор транскрипции
  createdDateTime: string; // Дата и время создания транскрипции (ISO 8601)
  // Могут быть и другие поля, например, язык, но они не используются в моках
}

/**
 * Предоставляет статические методы для работы с транскрипциями
 * онлайн-встреч Microsoft Teams через Microsoft Graph API.
 * Включает получение списка транскрипций и их содержимого.
 */
export class GraphTranscriptionsService {
  /**
   * Получает список метаданных транскрипций для онлайн-встречи Teams,
   * связанной с указанным событием календаря.
   *
   * @remarks
   * - **Важно:** По умолчанию доступ к транскрипциям через Graph API имеет только организатор встречи.
   *   Метод выполняет проверку, является ли текущий пользователь организатором.
   * - Если пользователь не организатор, метод вернет `null` (если `skipOrganizerCheck` не установлен в `true`).
   * - Сначала метод получает `onlineMeetingId` по `eventId`, используя `GraphMeetingsService`.
   *
   * @param eventId - Идентификатор события календаря Outlook, с которым связана встреча.
   * @param options - Дополнительные параметры запроса.
   * @param options.accessToken - Токен доступа для Graph API. Если не предоставлен, будет получен автоматически.
   * @param options.useMockData - Если true, возвращает моковые (тестовые) данные.
   * @param options.skipOrganizerCheck - Если true, пропускает проверку на то, является ли пользователь организатором встречи.
   *                                      Использовать с осторожностью, т.к. API все равно может вернуть ошибку доступа.
   * @returns Промис, который разрешается массивом объектов метаданных транскрипций (`TranscriptionMetadata[]`)
   *          или `null`, если пользователь не является организатором (и проверка не пропущена) или произошла ошибка API.
   */
  static async getMeetingTranscriptions(eventId: string, options: TranscriptionsRequestOptions = {}): Promise<TranscriptionMetadata[] | null> {
    // Проверяем на использование тестовых данных
    if (options.useMockData === true) {
      console.log(`[Mock] Получение транскрипций для события: ${eventId}`);
      // Моковый метод может использовать eventId или потребовать meetingId, адаптируем по необходимости
      // Здесь предполагаем, что моковый метод тоже может работать с eventId или просто возвращает общий набор
      return this.getMockMeetingTranscriptions(`mock-meeting-for-${eventId}`);
    }

    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Отсутствует токен доступа при получении транскрипций для события:', eventId);
        return null;
      }

      console.log(`Получение транскрипций для события календаря: ${eventId}`);

      // --- Шаг 1: Проверка, является ли пользователь организатором встречи ---
      if (!options.skipOrganizerCheck) {
        console.log(`Проверка прав организатора для события ${eventId}...`);
        try {
          const eventDetailsResponse = await fetch(`${GraphAuthService.apiBaseUrl}/me/events/${eventId}?$select=id,organizer`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });

          if (!eventDetailsResponse.ok) {
            console.error(`Ошибка API при получении организатора события ${eventId}: ${eventDetailsResponse.status} ${eventDetailsResponse.statusText}. Ответ: ${await eventDetailsResponse.text()}`);
            return null; // Не удалось получить данные события
          }
          const eventData = await eventDetailsResponse.json();

          const userResponse = await fetch(`${GraphAuthService.apiBaseUrl}/me?$select=mail,userPrincipalName`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });

          if (!userResponse.ok) {
            console.error(`Ошибка API при получении данных пользователя: ${userResponse.status} ${userResponse.statusText}. Ответ: ${await userResponse.text()}`);
            return null; // Не удалось получить данные пользователя
          }
          const userData = await userResponse.json();
          const currentUserEmail = userData.mail || userData.userPrincipalName;

          if (!currentUserEmail) {
             console.error('Не удалось определить email текущего пользователя.');
             return null;
          }

          const organizerEmail = eventData.organizer?.emailAddress?.address;
          if (!organizerEmail) {
             console.warn(`Не удалось определить email организатора для события ${eventId}.`);
             // Можно либо вернуть null, либо продолжить без проверки, если это допустимо
             // return null;
          }

          // Сравнение без учета регистра
          const isOrganizer = organizerEmail && organizerEmail.toLowerCase() === currentUserEmail.toLowerCase();

          if (!isOrganizer) {
            console.warn(`Доступ к транскрипциям события ${eventId} запрещен: пользователь (${currentUserEmail}) не является организатором (${organizerEmail || 'не определен'}).`);
            return null; // Возвращаем null, если пользователь не организатор
          }
          console.log(`Пользователь (${currentUserEmail}) является организатором события ${eventId}.`);

        } catch (checkError) {
           console.error(`Ошибка во время проверки прав организатора для события ${eventId}:`, checkError);
           return null; // Ошибка во время проверки
        }
      } else {
         console.log(`Проверка прав организатора для события ${eventId} пропущена (skipOrganizerCheck=true).`);
      }

      // --- Шаг 2: Получаем ID онлайн-встречи ---
      console.log(`Получение onlineMeetingId для события ${eventId}...`);
      const meetingId = await GraphMeetingsService.getOnlineMeetingId(eventId, { accessToken: token });
      if (!meetingId) {
        // getOnlineMeetingId уже логирует причину неудачи
        console.error(`Не удалось получить onlineMeetingId для события ${eventId}. Невозможно запросить транскрипции.`);
        return null;
      }
      console.log(`Найден onlineMeetingId: ${meetingId} для события ${eventId}.`);

      // --- Шаг 3: Получаем транскрипции для найденной онлайн-встречи ---
      console.log(`Запрос транскрипций для onlineMeetingId: ${meetingId}`);
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/me/onlineMeetings/${meetingId}/transcripts`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        // Обработка специфичных ошибок доступа (например, 403 Forbidden)
        if (response.status === 403) {
           console.warn(`Ошибка доступа (403 Forbidden) при получении транскрипций для встречи ${meetingId}. Возможно, пользователь не организатор или требуются доп. разрешения.`);
        } else {
           console.error(`Ошибка API при получении транскрипций для встречи ${meetingId}: ${response.status} ${response.statusText}. Ответ: ${await response.text()}`);
        }
        return null; // Возвращаем null при любой ошибке API на этом шаге
      }

      const transcriptionsData = await response.json();
      console.log(`Получено ${transcriptionsData.value?.length || 0} транскрипций для встречи ${meetingId}.`);
      return transcriptionsData.value || []; // Graph API возвращает данные в поле value
    } catch (error) {
      console.error(`Критическая ошибка при получении транскрипций для события ${eventId}:`, error);
      return null;
    }
  }

  /**
   * Генерирует и возвращает тестовый массив метаданных транскрипций.
   * Используется для разработки и тестирования UI без реальных запросов к API.
   *
   * @param meetingId - Идентификатор встречи (используется для генерации ID транскрипций).
   * @returns Массив моковых объектов метаданных (`TranscriptionMetadata[]`).
   */
  static getMockMeetingTranscriptions(meetingId: string): TranscriptionMetadata[] {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    return [
      {
        id: `transcript-${meetingId}-1`,
        createdDateTime: twoDaysAgo.toISOString(),
      },
      {
        id: `transcript-${meetingId}-2`,
        createdDateTime: yesterday.toISOString(),
      },
       {
        id: `transcript-${meetingId}-3`,
        createdDateTime: now.toISOString(),
      }
    ];
  }

  /**
   * Получает текстовое содержимое конкретной транскрипции.
   *
   * @param meetingId - Идентификатор онлайн-встречи (НЕ идентификатор события календаря).
   * @param transcriptId - Идентификатор конкретной транскрипции, полученный из `getMeetingTranscriptions`.
   * @param options - Дополнительные параметры запроса.
   * @param options.accessToken - Токен доступа для Graph API. Если не предоставлен, будет получен автоматически.
   * @param options.useMockData - Если true, возвращает моковое (тестовое) содержимое.
   * @returns Промис, который разрешается строкой с содержимым транскрипции (в формате VTT или как вернет API)
   *          или `null` в случае ошибки.
   */
  static async getTranscriptionContent(meetingId: string, transcriptId: string, options: TranscriptionsRequestOptions = {}): Promise<string | null> {
     // Проверяем на использование тестовых данных
    if (options.useMockData === true) {
      console.log(`[Mock] Получение содержимого транскрипции: ${transcriptId} для встречи ${meetingId}`);
      return this.getMockTranscriptionContent(meetingId, transcriptId);
    }

    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        console.error(`Отсутствует токен доступа при получении содержимого транскрипции ${transcriptId} для встречи ${meetingId}`);
        return null;
      }

      console.log(`Запрос содержимого транскрипции ${transcriptId} для встречи ${meetingId}`);

      // Запрос к API для получения содержимого транскрипции
      // Конечная точка возвращает содержимое напрямую, часто в формате VTT
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content?$format=text/vtt`, // Запрашиваем VTT формат
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            // 'Accept': 'text/vtt' // Можно указать, какой формат ожидаем
          },
        }
      );

      if (!response.ok) {
        // Логируем ошибку, но возвращаем null
         console.warn(`Ошибка API при получении содержимого транскрипции ${transcriptId} (встреча ${meetingId}): ${response.status} ${response.statusText}. Ответ: ${await response.text()}`);
        return null;
      }

      // Важно: Graph API возвращает содержимое как текст (или VTT), а не JSON
      const content = await response.text();
      console.log(`Получено содержимое транскрипции ${transcriptId} (встреча ${meetingId}). Размер: ${content.length} символов.`);
      return content;

    } catch (error) {
      console.error(`Критическая ошибка при получении содержимого транскрипции ${transcriptId} (встреча ${meetingId}):`, error);
      return null;
    }
  }

  /**
   * Генерирует и возвращает тестовое текстовое содержимое для указанной транскрипции.
   * Используется для разработки и тестирования UI.
   *
   * @param meetingId - Идентификатор встречи (для контекста, может не использоваться).
   * @param transcriptId - Идентификатор транскрипции, для которой генерируется содержимое.
   * @returns Строка с тестовым содержимым транскрипции или сообщение о недоступности.
   */
  static getMockTranscriptionContent(meetingId: string, transcriptId: string): string {
    // Возвращаем простую заглушку вместо детализированного VTT
    return `WEBVTT\n\n[Mock VTT Content for transcript: ${transcriptId}, meeting: ${meetingId}]`;
  }

  /**
   * Получает текст транскрипции Teams-встречи по данным события календаря.
   * Автоматически ищет callRecordId по времени и теме события, затем возвращает текст транскрипта (если найден).
   *
   * @param event CalendarEvent — объект события календаря
   * @param options — дополнительные параметры (токен, mock-режим)
   * @returns Promise<string|null> — текст транскрипта или null, если не найден/нет прав
   */
  static async getMeetingTranscriptByCalendarEvent(event: any, options: TranscriptionsRequestOptions = {}): Promise<string | null> {
    if (options.useMockData) {
      // Для моковых данных просто возвращаем заглушку
      return '[Mock transcript for event: ' + event.id + ']';
    }
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        console.error('Нет accessToken для получения транскрипции по событию календаря');
        return null;
      }
      // 1. Получаем call records за +-2 часа от времени события
      const start = new Date(new Date(event.start.dateTime).getTime() - 2 * 60 * 60 * 1000).toISOString();
      const end = new Date(new Date(event.end.dateTime).getTime() + 2 * 60 * 60 * 1000).toISOString();
      const url = `${GraphAuthService.apiBaseUrl}/communications/callRecords?$filter=startDateTime ge ${start} and endDateTime le ${end}`;
      const recordsResp = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!recordsResp.ok) {
        console.error('Ошибка получения callRecords:', await recordsResp.text());
        return null;
      }
      const recordsJson = await recordsResp.json();
      // 2. Ищем callRecordId по теме (subject) и организатору
      const normalizedSubject = (event.subject || '').toLowerCase();
      const eventOrganizerId = event.organizer?.id;
      const candidates = (recordsJson.value || []).filter((rec: any) =>
        (rec.subject || '').toLowerCase() === normalizedSubject &&
        rec.organizer?.user?.id === eventOrganizerId
      );
      if (!candidates.length) {
        console.warn('Не найден callRecordId для события', event.id);
        return null;
      }
      const callRecordId = candidates[0].id;
      // 3. Получаем список сессий
      const sessionsResp = await fetch(`${GraphAuthService.apiBaseUrl}/communications/callRecords/${callRecordId}/sessions`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sessionsResp.ok) {
        console.error('Ошибка получения sessions:', await sessionsResp.text());
        return null;
      }
      const sessionsJson = await sessionsResp.json();
      const sessions = sessionsJson.value || [];
      if (!sessions.length) {
        console.warn('Нет сессий для callRecord', callRecordId);
        return null;
      }
      // 4. Ищем транскрипты по сессиям
      for (const session of sessions) {
        const transcriptsResp = await fetch(`${GraphAuthService.apiBaseUrl}/communications/callRecords/${callRecordId}/sessions/${session.id}/transcripts`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!transcriptsResp.ok) continue;
        const transcriptsJson = await transcriptsResp.json();
        const transcripts = transcriptsJson.value || [];
        if (transcripts.length) {
          // Берём первый транскрипт
          const transcriptId = transcripts[0].id;
          // 5. Получаем содержимое транскрипта
          const contentResp = await fetch(`${GraphAuthService.apiBaseUrl}/communications/callRecords/${callRecordId}/sessions/${session.id}/transcripts/${transcriptId}/content`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!contentResp.ok) continue;
          const content = await contentResp.text();
          return content;
        }
      }
      // Если не нашли транскриптов ни в одной сессии
      console.warn('Не найдено транскриптов для события', event.id);
      return null;
    } catch (e) {
      console.error('Ошибка при получении транскрипта по событию календаря:', e);
      return null;
    }
  }

  /**
   * Альтернативный способ: получить ссылку на транскрипт через чат встречи Teams.
   *
   * @param meetingId - идентификатор onlineMeeting (Teams)
   * @returns текст транскрипта или null
   */
  static async getTranscriptFromMeetingChat(meetingChatId: string, options: { accessToken?: string } = {}): Promise<string | null> {
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) throw new Error('Нет accessToken для Graph API');
      // Получаем все сообщения чата
      const messagesResp = await fetch(`${GraphAuthService.apiBaseUrl}/chats/${meetingChatId}/messages?$top=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!messagesResp.ok) {
        console.error('Ошибка получения сообщений чата:', await messagesResp.text());
        return null;
      }
      const messagesData = await messagesResp.json();
      const messages = messagesData.value || [];
      console.log(`[Транскрипт] Всего сообщений в чате:`, messages.length);
      // Ключевые слова для поиска
      const keywords = ['transcript', 'транскрипт', 'transcription'];
      let foundAttachments: any[] = [];
      for (const msg of messages) {
        if (!msg.attachments || !Array.isArray(msg.attachments)) continue;
        for (const att of msg.attachments) {
          const name = (att.name || att.contentUrl || '').toLowerCase();
          foundAttachments.push({
            name: att.name,
            contentUrl: att.contentUrl,
            msgId: msg.id,
            from: msg.from?.user?.displayName || msg.from?.application?.displayName || msg.from?.user?.id || 'unknown',
            ts: msg.createdDateTime
          });
          if ((name.endsWith('.txt') || name.endsWith('.vtt')) && keywords.some(k => name.includes(k))) {
            // Нашли подходящее вложение - скачиваем
            console.log(`[Транскрипт] Найдено подходящее вложение:`, att.name, att.contentUrl, 'в сообщении:', msg.id);
            if (att.contentUrl) {
              const fileResp = await fetch(att.contentUrl, { headers: { Authorization: `Bearer ${token}` } });
              if (!fileResp.ok) {
                console.error('Ошибка скачивания вложения из чата:', await fileResp.text());
                continue;
              }
              const text = await fileResp.text();
              console.log('Транскрипт найден и скачан из чата:', att.name || att.contentUrl);
              return text;
            }
          }
        }
      }
      if (foundAttachments.length > 0) {
        console.log(`[Транскрипт] Все найденные вложения в чате:`, foundAttachments);
      } else {
        console.log(`[Транскрипт] В чате нет вложений в сообщениях.`);
      }
      console.warn('Транскрипт не найден в чате (нет подходящих вложений).');
      return null;
    } catch (e) {
      console.error('Ошибка поиска транскрипта в чате:', e);
      return null;
    }
  }

  /**
   * Альтернативный способ: получить ссылки на все .vtt-вложения (транскрипты) через чат встречи Teams.
   *
   * @param meetingChatId - идентификатор чата встречи (Teams)
   * @param options - дополнительные параметры (accessToken)
   * @returns Массив объектов с информацией о .vtt-файлах или пустой массив
   */
  static async findVttTranscriptsInMeetingChat(meetingChatId: string, options: { accessToken?: string } = {}): Promise<Array<{ name: string, url: string, messageId: string, created: string }>> {
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) throw new Error('Нет accessToken для Graph API');
      const apiBase = GraphAuthService.apiBaseUrl;
      let url = `${apiBase}/chats/${meetingChatId}/messages?$top=50`;
      let foundVtt: Array<{ name: string, url: string, messageId: string, created: string }> = [];
      let totalMessages = 0;
      while (url) {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) {
          console.error(`[Транскрипт][.vtt] Ошибка запроса сообщений чата:`, await resp.text());
          break;
        }
        const data = await resp.json();
        const messages = data.value || [];
        totalMessages += messages.length;
        for (const msg of messages) {
          if (msg.attachments && Array.isArray(msg.attachments)) {
            for (const att of msg.attachments) {
              const name = att.name || '';
              if (name.toLowerCase().endsWith('.vtt') && att.contentUrl) {
                foundVtt.push({
                  name,
                  url: att.contentUrl,
                  messageId: msg.id,
                  created: msg.createdDateTime
                });
                console.log(`[Транскрипт][.vtt] Найден файл:`, name, att.contentUrl, 'в сообщении:', msg.id);
              }
            }
          }
        }
        url = data['@odata.nextLink'] || null;
      }
      console.log(`[Транскрипт][.vtt] Просмотрено сообщений: ${totalMessages}, найдено .vtt файлов: ${foundVtt.length}`);
      return foundVtt;
    } catch (e) {
      console.error('[Транскрипт][.vtt] Ошибка поиска .vtt-файлов в чате:', e);
      return [];
    }
  }

  /**
   * Поиск транскрипта встречи в OneDrive пользователя (по теме и дате встречи).
   *
   * @param subject Тема встречи
   * @param meetingDate Дата и время встречи (Date)
   * @param options accessToken (опционально)
   * @returns текст транскрипта или null
   */
  static async findTranscriptInOneDrive(subject: string, meetingDate: Date, options: { accessToken?: string } = {}): Promise<string | null> {
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) throw new Error('Нет accessToken для Graph API');
      // 1. Поиск файлов по теме встречи
      const searchQuery = encodeURIComponent(subject || 'transcript');
      const resp = await fetch(`${GraphAuthService.apiBaseUrl}/me/drive/root/search(q='${searchQuery}')`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!resp.ok) {
        console.error('Ошибка поиска файлов транскрипта в OneDrive:', await resp.text());
        return null;
      }
      const data = await resp.json();
      // 2. Фильтруем по расширению и дате
      const files = (data.value || []).filter((item: any) =>
        (item.name?.toLowerCase().endsWith('.vtt') || item.name?.toLowerCase().endsWith('.txt')) &&
        Math.abs(new Date(item.createdDateTime).getTime() - meetingDate.getTime()) < 1000 * 60 * 60 * 24 // +-1 день
      );
      if (!files.length) {
        console.warn('Файлы транскрипта не найдены в OneDrive по теме:', subject);
        return null;
      }
      // 3. Получаем содержимое первого найденного файла
      const fileId = files[0].id;
      const fileResp = await fetch(`${GraphAuthService.apiBaseUrl}/me/drive/items/${fileId}/content`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!fileResp.ok) {
        console.error('Ошибка скачивания файла транскрипта из OneDrive:', await fileResp.text());
        return null;
      }
      return await fileResp.text();
    } catch (e) {
      console.error('Ошибка поиска транскрипта в OneDrive:', e);
      return null;
    }
  }
}
