import { CalendarEvent, CalendarRequestOptions, TeamsMeetingsRequestOptions } from '@/types/graph-types';
import { GraphAuthService } from './auth-service';
import { logger } from '@/lib/logger';

// Ключи для кэширования результатов
const CALENDAR_CACHE_KEY = 'calendar_events_cache';
const CALENDAR_CACHE_EXPIRY_KEY = 'calendar_events_cache_expiry';
const TEAMS_MEETINGS_CACHE_KEY = 'teams_meetings_cache';
const TEAMS_MEETINGS_CACHE_EXPIRY_KEY = 'teams_meetings_cache_expiry';
const CACHE_TTL = 5 * 60 * 1000; // 5 минут в миллисекундах

/**
 * Класс для работы с календарем через Microsoft Graph API
 */
export class GraphCalendarService {
  /**
   * Получение событий календаря на указанный период
   * 
   * @param options Опции для запроса календаря
   * @returns Массив событий календаря
   */
  static async getCalendarEvents(options: CalendarRequestOptions = {}): Promise<CalendarEvent[]> {
    try {
      const now = new Date();
      const startDate = options.startDate || new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = options.endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startDateTimeISO = startDate.toISOString();
      const endDateTimeISO = endDate.toISOString();
      
      // Создаем ключ кэша на основе дат
      const cacheKey = `${CALENDAR_CACHE_KEY}_${startDateTimeISO}_${endDateTimeISO}`;
      const cacheExpiryKey = `${CALENDAR_CACHE_EXPIRY_KEY}_${startDateTimeISO}_${endDateTimeISO}`;
      
      // Проверяем кэш
      if (typeof window !== 'undefined') {
        const cachedData = localStorage.getItem(cacheKey);
        const cacheExpiry = localStorage.getItem(cacheExpiryKey);
        
        if (cachedData && cacheExpiry) {
          const now = Date.now();
          if (now < parseInt(cacheExpiry)) {
            // Используем кэшированные данные
            logger.info(`Используются кэшированные события календаря с ${startDateTimeISO} по ${endDateTimeISO}`);
            return JSON.parse(cachedData);
          }
        }
      }
      
      // Если кэш не найден или устарел, делаем новый запрос
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        logger.error('Отсутствует токен доступа при получении событий календаря');
        return [];
      }
      logger.info(`Запрос событий календаря с ${startDateTimeISO} по ${endDateTimeISO}`);
      let events: CalendarEvent[] = [];
      let url = `${GraphAuthService.apiBaseUrl}/me/calendarView?startDateTime=${startDateTimeISO}&endDateTime=${endDateTimeISO}&$select=id,subject,start,end,location,organizer,isAllDay&$top=50`;
      while (url) {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'outlook.timezone="Europe/Moscow"'
          },
        });
        if (!response.ok) {
          logger.error(`Ошибка API при получении событий календаря: ${response.status} ${response.statusText}`);
          return events;
        }
        const data = await response.json();
        events = events.concat(data.value || []);
        url = data['@odata.nextLink'] || null;
      }
      // Сортировка событий по дате начала (по возрастанию)
      events.sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
      
      // Кэшируем результат
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(events));
          localStorage.setItem(cacheExpiryKey, (Date.now() + CACHE_TTL).toString());
        } catch (cacheError: unknown) {
          logger.warn('Не удалось кэшировать события календаря:', cacheError);
        }
      }
      
      return events;
    } catch (error: unknown) {
      logger.error('Ошибка при получении событий календаря:', error);
      return [];
    }
  }

  /**
   * Получает Teams-встречи за указанный период
   * 
   * @param options Параметры запроса
   * @returns Список Teams-встреч с дополнительным флагом isOrganizer
   */
  static async getTeamsMeetings(options: TeamsMeetingsRequestOptions = {}): Promise<(CalendarEvent & { isOrganizer?: boolean })[]> {
    try {
      // Формируем параметры дат
      const now = new Date();
      const startDate = options.startDateTime ? new Date(options.startDateTime) : new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = options.endDateTime ? new Date(options.endDateTime) : new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startDateTimeISO = startDate.toISOString();
      const endDateTimeISO = endDate.toISOString();
      
      // Создаем ключ кэша на основе дат
      const cacheKey = `${TEAMS_MEETINGS_CACHE_KEY}_${startDateTimeISO}_${endDateTimeISO}`;
      const cacheExpiryKey = `${TEAMS_MEETINGS_CACHE_EXPIRY_KEY}_${startDateTimeISO}_${endDateTimeISO}`;
      
      // Проверяем кэш
      if (typeof window !== 'undefined') {
        const cachedData = localStorage.getItem(cacheKey);
        const cacheExpiry = localStorage.getItem(cacheExpiryKey);
        
        if (cachedData && cacheExpiry) {
          const now = Date.now();
          if (now < parseInt(cacheExpiry)) {
            // Используем кэшированные данные
            logger.info(`Используются кэшированные Teams-встречи с ${startDateTimeISO} по ${endDateTimeISO}`);
            return JSON.parse(cachedData);
          }
        }
      }
      
      // Если кэш не найден или устарел, делаем новый запрос
      const token = options.accessToken || await GraphAuthService.getAccessToken();
      if (!token) {
        logger.error('Отсутствует токен доступа при получении Teams-встреч');
        return [];
      }
      
      // Получаем текущего пользователя для сравнения с организатором
      const userResponse = await fetch(
        `${GraphAuthService.apiBaseUrl}/me?$select=mail,userPrincipalName`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (!userResponse.ok) {
        logger.error(`Ошибка API при получении данных пользователя: ${userResponse.status} ${userResponse.statusText}`);
        return [];
      }
      
      const userData = await userResponse.json();
      const currentUserEmail = userData.mail || userData.userPrincipalName;
      logger.info(`Текущий пользователь: ${currentUserEmail}`);
      let meetings: (CalendarEvent & { isOrganizer?: boolean })[] = [];
      let url = `${GraphAuthService.apiBaseUrl}/me/calendarView?startDateTime=${startDateTimeISO}&endDateTime=${endDateTimeISO}&$top=50`;
      while (url) {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Prefer': 'outlook.timezone="Europe/Moscow"'
          },
        });
        if (!response.ok) {
          logger.error(`Ошибка API при получении Teams-встреч: ${response.status} ${response.statusText}`);
          return meetings;
        }
        const data = await response.json();
        // Фильтрация только Teams-встреч
        const teamsMeetings = (data.value || []).filter((event: CalendarEvent) => {
          return (
            event.onlineMeeting &&
            event.onlineMeeting.joinUrl &&
            event.onlineMeeting.joinUrl.includes('teams.microsoft.com')
          );
        }).map((event: CalendarEvent) => {
          // Проверяем, является ли текущий пользователь организатором
          const isOrganizer = event.organizer &&
            event.organizer.emailAddress &&
            event.organizer.emailAddress.address &&
            event.organizer.emailAddress.address.toLowerCase() === currentUserEmail.toLowerCase();
          return {
            ...event,
            isOrganizer
          };
        });
        meetings = meetings.concat(teamsMeetings);
        url = data['@odata.nextLink'] || null;
      }
      // Сортировка встреч по дате начала (по возрастанию)
      meetings.sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime());
      logger.info(`Найдено ${meetings.length} Teams-встреч`);
      
      // Кэшируем результат
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(meetings));
          localStorage.setItem(cacheExpiryKey, (Date.now() + CACHE_TTL).toString());
        } catch (cacheError: unknown) {
          logger.warn('Не удалось кэшировать Teams-встречи:', cacheError);
        }
      }
      
      return meetings;
    } catch (error: unknown) {
      logger.error('Ошибка при получении Teams-встреч:', error);
      return [];
    }
  }
}

