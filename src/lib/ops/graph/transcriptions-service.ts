import { TranscriptionsRequestOptions } from '@/types/graph-types';
import { GraphAuthService } from './auth-service';
import { GraphMeetingsService } from './meetings-service';
import { logger } from '@/lib/shared/logger';
import {
  getTranscriptFromMeetingChat,
  findVttTranscriptsInMeetingChat,
} from './transcription-chat';
import { findTranscriptInOneDrive } from './transcription-drive';

interface TranscriptionMetadata {
  id: string;
  createdDateTime: string;
}

interface CalendarEventLike {
  id: string;
  subject?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  organizer?: { id?: string };
}

interface CallRecordItem {
  id: string;
  subject?: string;
  organizer?: { user?: { id?: string } };
}

/**
 * Предоставляет статические методы для работы с транскрипциями
 * онлайн-встреч Microsoft Teams через Microsoft Graph API.
 */
export class GraphTranscriptionsService {
  static async getMeetingTranscriptions(eventId: string, options: TranscriptionsRequestOptions = {}): Promise<TranscriptionMetadata[] | null> {
    if (options.useMockData === true) {
      logger.info(`[Mock] Получение транскрипций для события: ${eventId}`);
      return this.getMockMeetingTranscriptions(`mock-meeting-for-${eventId}`);
    }

    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        logger.error('Отсутствует токен доступа при получении транскрипций для события:', eventId);
        return null;
      }

      logger.info(`Получение транскрипций для события календаря: ${eventId}`);

      if (!options.skipOrganizerCheck) {
        logger.info(`Проверка прав организатора для события ${eventId}...`);
        try {
          const eventDetailsResponse = await fetch(`${GraphAuthService.apiBaseUrl}/me/events/${eventId}?$select=id,organizer`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });

          if (!eventDetailsResponse.ok) {
            logger.error(`Ошибка API при получении организатора события ${eventId}: ${eventDetailsResponse.status} ${eventDetailsResponse.statusText}. Ответ: ${await eventDetailsResponse.text()}`);
            return null;
          }
          const eventData = await eventDetailsResponse.json();

          const userResponse = await fetch(`${GraphAuthService.apiBaseUrl}/me?$select=mail,userPrincipalName`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
          });

          if (!userResponse.ok) {
            logger.error(`Ошибка API при получении данных пользователя: ${userResponse.status} ${userResponse.statusText}. Ответ: ${await userResponse.text()}`);
            return null;
          }
          const userData = await userResponse.json();
          const currentUserEmail = userData.mail || userData.userPrincipalName;

          if (!currentUserEmail) {
            logger.error('Не удалось определить email текущего пользователя.');
            return null;
          }

          const organizerEmail = eventData.organizer?.emailAddress?.address;
          if (!organizerEmail) {
            logger.warn(`Не удалось определить email организатора для события ${eventId}.`);
          }

          const isOrganizer = organizerEmail && organizerEmail.toLowerCase() === currentUserEmail.toLowerCase();

          if (!isOrganizer) {
            logger.warn(`Доступ к транскрипциям события ${eventId} запрещен: пользователь (${currentUserEmail}) не является организатором (${organizerEmail || 'не определен'}).`);
            return null;
          }
          logger.info(`Пользователь (${currentUserEmail}) является организатором события ${eventId}.`);

        } catch (checkError: unknown) {
          logger.error(`Ошибка во время проверки прав организатора для события ${eventId}:`, checkError);
          return null;
        }
      } else {
        logger.info(`Проверка прав организатора для события ${eventId} пропущена (skipOrganizerCheck=true).`);
      }

      logger.info(`Получение onlineMeetingId для события ${eventId}...`);
      const meetingId = await GraphMeetingsService.getOnlineMeetingId(eventId, { accessToken: token });
      if (!meetingId) {
        logger.error(`Не удалось получить onlineMeetingId для события ${eventId}. Невозможно запросить транскрипции.`);
        return null;
      }
      logger.info(`Найден onlineMeetingId: ${meetingId} для события ${eventId}.`);

      logger.info(`Запрос транскрипций для onlineMeetingId: ${meetingId}`);
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/me/onlineMeetings/${meetingId}/transcripts`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        if (response.status === 403) {
          logger.warn(`Ошибка доступа (403 Forbidden) при получении транскрипций для встречи ${meetingId}.`);
        } else {
          logger.error(`Ошибка API при получении транскрипций для встречи ${meetingId}: ${response.status} ${response.statusText}. Ответ: ${await response.text()}`);
        }
        return null;
      }

      const transcriptionsData = await response.json();
      logger.info(`Получено ${transcriptionsData.value?.length || 0} транскрипций для встречи ${meetingId}.`);
      return transcriptionsData.value || [];
    } catch (error: unknown) {
      logger.error(`Критическая ошибка при получении транскрипций для события ${eventId}:`, error);
      return null;
    }
  }

  static getMockMeetingTranscriptions(meetingId: string): TranscriptionMetadata[] {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    return [
      { id: `transcript-${meetingId}-1`, createdDateTime: twoDaysAgo.toISOString() },
      { id: `transcript-${meetingId}-2`, createdDateTime: yesterday.toISOString() },
      { id: `transcript-${meetingId}-3`, createdDateTime: now.toISOString() },
    ];
  }

  static async getTranscriptionContent(meetingId: string, transcriptId: string, options: TranscriptionsRequestOptions = {}): Promise<string | null> {
    if (options.useMockData === true) {
      logger.info(`[Mock] Получение содержимого транскрипции: ${transcriptId} для встречи ${meetingId}`);
      return this.getMockTranscriptionContent(meetingId, transcriptId);
    }

    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        logger.error(`Отсутствует токен доступа при получении содержимого транскрипции ${transcriptId} для встречи ${meetingId}`);
        return null;
      }

      logger.info(`Запрос содержимого транскрипции ${transcriptId} для встречи ${meetingId}`);
      const response = await fetch(
        `${GraphAuthService.apiBaseUrl}/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content?$format=text/vtt`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        logger.warn(`Ошибка API при получении содержимого транскрипции ${transcriptId} (встреча ${meetingId}): ${response.status} ${response.statusText}. Ответ: ${await response.text()}`);
        return null;
      }

      const content = await response.text();
      logger.info(`Получено содержимое транскрипции ${transcriptId} (встреча ${meetingId}). Размер: ${content.length} символов.`);
      return content;
    } catch (error: unknown) {
      logger.error(`Критическая ошибка при получении содержимого транскрипции ${transcriptId} (встреча ${meetingId}):`, error);
      return null;
    }
  }

  static getMockTranscriptionContent(meetingId: string, transcriptId: string): string {
    return `WEBVTT\n\n[Mock VTT Content for transcript: ${transcriptId}, meeting: ${meetingId}]`;
  }

  static async getMeetingTranscriptByCalendarEvent(event: CalendarEventLike, options: TranscriptionsRequestOptions = {}): Promise<string | null> {
    if (options.useMockData) {
      return '[Mock transcript for event: ' + event.id + ']';
    }
    try {
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        logger.error('Нет accessToken для получения транскрипции по событию календаря');
        return null;
      }
      const start = new Date(new Date(event.start.dateTime).getTime() - 2 * 60 * 60 * 1000).toISOString();
      const end = new Date(new Date(event.end.dateTime).getTime() + 2 * 60 * 60 * 1000).toISOString();
      const url = `${GraphAuthService.apiBaseUrl}/communications/callRecords?$filter=startDateTime ge ${start} and endDateTime le ${end}`;
      const recordsResp = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!recordsResp.ok) {
        logger.error('Ошибка получения callRecords:', await recordsResp.text());
        return null;
      }
      const recordsJson = await recordsResp.json();
      const normalizedSubject = (event.subject || '').toLowerCase();
      const eventOrganizerId = event.organizer?.id;
      const candidates = ((recordsJson.value || []) as CallRecordItem[]).filter((rec) =>
        (rec.subject || '').toLowerCase() === normalizedSubject &&
        rec.organizer?.user?.id === eventOrganizerId
      );
      if (!candidates.length) {
        logger.warn('Не найден callRecordId для события', event.id);
        return null;
      }
      const callRecordId = candidates[0].id;
      const sessionsResp = await fetch(`${GraphAuthService.apiBaseUrl}/communications/callRecords/${callRecordId}/sessions`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!sessionsResp.ok) {
        logger.error('Ошибка получения sessions:', await sessionsResp.text());
        return null;
      }
      const sessionsJson = await sessionsResp.json();
      const sessions = sessionsJson.value || [];
      if (!sessions.length) {
        logger.warn('Нет сессий для callRecord', callRecordId);
        return null;
      }
      for (const session of sessions) {
        const transcriptsResp = await fetch(`${GraphAuthService.apiBaseUrl}/communications/callRecords/${callRecordId}/sessions/${session.id}/transcripts`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!transcriptsResp.ok) continue;
        const transcriptsJson = await transcriptsResp.json();
        const transcripts = transcriptsJson.value || [];
        if (transcripts.length) {
          const transcriptId = transcripts[0].id;
          const contentResp = await fetch(`${GraphAuthService.apiBaseUrl}/communications/callRecords/${callRecordId}/sessions/${session.id}/transcripts/${transcriptId}/content`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!contentResp.ok) continue;
          return await contentResp.text();
        }
      }
      logger.warn('Не найдено транскриптов для события', event.id);
      return null;
    } catch (e: unknown) {
      logger.error('Ошибка при получении транскрипта по событию календаря:', e);
      return null;
    }
  }

  // Delegating to extracted modules
  static getTranscriptFromMeetingChat = getTranscriptFromMeetingChat;
  static findVttTranscriptsInMeetingChat = findVttTranscriptsInMeetingChat;
  static findTranscriptInOneDrive = findTranscriptInOneDrive;
}
